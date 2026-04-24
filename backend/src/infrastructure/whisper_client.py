"""
Cliente asíncrono para la API de transcripción de audio de Hugging Face.

Responsabilidad: Única — enviar el binario de audio al modelo Whisper large-v3
vía proveedor fal-ai y retornar el texto transcripto como string.

Arquitectura de llamada:
    InferenceClient(provider="fal-ai") es síncrono.
    Se envuelve en asyncio.get_event_loop().run_in_executor para no
    bloquear el event loop de FastAPI (uvicorn/asyncio).

Formato esperado por el InferenceClient:
    - El modelo openai/whisper-large-v3 acepta:
      * audio/wav  (WAV PCM) — formato preferido
      * audio/flac
      * audio/mp3 / audio/mpeg
    - Se envía el BinaryIO directamente (io.BytesIO) para que
      huggingface_hub calcule el Content-Type correcto.
"""

import asyncio
import io
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import HuggingFaceAPIError, IdentificationFailedError

logger = logging.getLogger(__name__)

# ThreadPoolExecutor dedicado para llamadas síncronas de InferenceClient.
# max_workers=4 es suficiente; las llamadas están principalmente limitadas por I/O de red.
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="whisper-worker")


def _llamar_whisper_sincrono(audio_bytes: bytes, model_id: str, hf_token: str) -> str:
    """
    Llamada síncrona al InferenceClient de Hugging Face.

    Esta función debe ejecutarse en un hilo separado (via run_in_executor)
    para no bloquear el event loop asíncrono de FastAPI.

    Args:
        audio_bytes: Contenido binario del archivo WAV.
        model_id: Identificador del modelo Whisper en Hugging Face.
        hf_token: Token de autenticación de Hugging Face.

    Returns:
        Texto transcripto como string limpio.

    Raises:
        Exception: Cualquier error del InferenceClient se propaga para
                   ser capturado en la capa async.
    """
    # Import local para evitar que el módulo falle en entornos sin huggingface_hub
    from huggingface_hub import InferenceClient  # noqa: PLC0415

    client = InferenceClient(
        provider="fal-ai",
        api_key=hf_token,
    )

    # BytesIO para que huggingface_hub lo trate como archivo y aplique
    # automáticamente el Content-Type correcto según la extensión/magic bytes.
    audio_file = io.BytesIO(audio_bytes)

    resultado: Any = client.automatic_speech_recognition(
        audio_file,
        model=model_id,
    )

    # La respuesta puede ser un string directo o un objeto con atributo 'text'
    # dependiendo de la versión de huggingface_hub.
    if isinstance(resultado, str):
        return resultado.strip()

    if hasattr(resultado, "text"):
        return str(resultado.text).strip()

    # Fallback: convertir a string sea cual sea el tipo
    return str(resultado).strip()


async def transcribir_audio(audio_bytes: bytes) -> str:
    """
    Envía el binario de audio WAV a Whisper large-v3 vía fal-ai y retorna
    el texto transcripto.

    La llamada síncrona al InferenceClient se delega a un ThreadPoolExecutor
    para no bloquear el event loop de FastAPI durante la llamada de red.

    Args:
        audio_bytes: Contenido binario del archivo WAV (RIFF/WAVE PCM).
                     Se asume que ya fue validado por audio_validation.py.

    Returns:
        Texto transcripto como string (puede ser vacío si el audio no tiene
        contenido inteligible; el caso de uso aplicará el failsafe).

    Raises:
        HuggingFaceAPIError: Si hay un fallo de red, timeout o respuesta de error.
        IdentificationFailedError: Si el resultado no puede convertirse a texto.
    """
    settings = get_settings()
    model_id = settings.hf_whisper_model_id

    logger.info(
        "Enviando audio a Whisper | modelo=%s | tamaño=%d bytes | proveedor=fal-ai",
        model_id,
        len(audio_bytes),
    )

    loop = asyncio.get_event_loop()
    try:
        texto = await loop.run_in_executor(
            _executor,
            _llamar_whisper_sincrono,
            audio_bytes,
            model_id,
            settings.hf_api_token,
        )
    except Exception as exc:
        logger.error(
            "Error al llamar a Whisper vía fal-ai | modelo=%s | error=%s",
            model_id,
            str(exc),
        )
        # Distinguir entre error de red y otros errores
        error_str = str(exc).lower()
        if any(kw in error_str for kw in ("timeout", "connection", "network", "connect")):
            raise HuggingFaceAPIError(
                message="El servicio de transcripción tardó demasiado en responder. Intenta nuevamente."
            ) from exc

        raise HuggingFaceAPIError(
            message="No se pudo conectar con el servicio de transcripción de audio."
        ) from exc

    logger.info(
        "Transcripción recibida | modelo=%s | longitud_texto=%d caracteres",
        model_id,
        len(texto),
    )

    return texto

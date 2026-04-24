"""
Caso de uso: Transcribir Audio con Whisper.

Responsabilidad: Orquestar el flujo completo de transcripción de audio:
    1. Llamar al cliente Whisper con el binario del audio.
    2. Aplicar el principio Failsafe: si el texto está vacío, marcar como
       'requiere_revision_humana = True' sin romper el flujo del usuario.
    3. Registrar log de trazabilidad con longitud de texto y modelo usado.

Desacoplamiento: Este caso de uso depende del whisper_client como callable
inyectable, lo que facilita el testing con mocks sin llamadas reales a HF.
"""

import logging
from dataclasses import dataclass

from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import HuggingFaceAPIError

logger = logging.getLogger(__name__)


@dataclass
class ResultadoTranscripcion:
    """
    Entidad de dominio que representa el resultado de una transcripción de audio.

    Attributes:
        texto: Texto transcripto por el modelo. Puede estar vacío si
               el audio no contenía speech inteligible.
        requiere_revision_humana: True si el texto está vacío o el modelo
                                  falló y se aplicó el failsafe.
        modelo_usado: Identificador del modelo HF para trazabilidad científica.
    """

    texto: str
    requiere_revision_humana: bool
    modelo_usado: str


async def transcribir_audio_especie(
    audio_bytes: bytes,
    transcriptor_fn: object,
) -> ResultadoTranscripcion:
    """
    Caso de uso principal: transcribe el audio recibido usando Whisper.

    Implementa el principio Failsafe:
    - Si el texto transcripto está vacío → requiere_revision_humana = True.
    - Si el transcriptor_fn lanza HuggingFaceAPIError → se propaga (error de red).
    - Cualquier otro error inesperado → Failsafe activa revisión humana.

    Args:
        audio_bytes: Binario del audio WAV ya validado por audio_validation.py.
        transcriptor_fn: Función asíncrona que llama a la API de Whisper.
                         Firma esperada: async (bytes) -> str

    Returns:
        ResultadoTranscripcion con el texto, flag de revisión y modelo usado.

    Raises:
        HuggingFaceAPIError: Propagada si hay fallos de red/timeout en el transcriptor.
    """
    settings = get_settings()
    modelo = settings.hf_whisper_model_id

    # Intentar transcripción con failsafe integrado
    texto: str = ""
    requiere_revision = False

    try:
        texto = await transcriptor_fn(audio_bytes)  # type: ignore[call-arg]
    except HuggingFaceAPIError:
        # Error de red: propagar para que el endpoint lo maneje como HTTP 502
        raise
    except Exception as exc:
        # Error inesperado del transcriptor → activar failsafe en lugar de crash
        logger.error(
            "Error inesperado en transcriptor Whisper | modelo=%s | error=%s",
            modelo,
            str(exc),
        )
        requiere_revision = True
        texto = ""

    # Aplicar failsafe por texto vacío
    if not texto:
        requiere_revision = True
        logger.warning(
            "Transcripción vacía — marcado para revisión humana | modelo=%s",
            modelo,
        )

    logger.info(
        "Transcripción completada | modelo=%s | longitud=%d chars | requiere_revision=%s",
        modelo,
        len(texto),
        requiere_revision,
    )

    return ResultadoTranscripcion(
        texto=texto,
        requiere_revision_humana=requiere_revision,
        modelo_usado=modelo,
    )

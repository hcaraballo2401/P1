"""
Endpoints del dominio de Identificación Animal y Transcripción de Audio.

Responsabilidad única: Recibir la petición HTTP, validar el archivo,
coordinar el flujo del caso de uso, y retornar la respuesta al cliente.

NO contiene lógica de negocio. Solo traduce entre HTTP y el dominio.

Endpoints:
    POST /identificar  — Imagen → identificación de especie (IA visual)
    POST /transcribir  — Audio WAV → transcripción de voz (Whisper large-v3)
"""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from src.api.identificacion.schemas import (
    CandidatoEspecieSchema,
    IdentificacionResponseSchema,
)
from src.api.identificacion.transcripcion_schemas import TranscripcionResponseSchema
from src.identificacion_animal.casos_de_uso import identificar_animal
from src.identificacion_animal.transcripcion_casos_de_uso import transcribir_audio_especie
from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import (
    AppError,
    AudioTooLargeError,
    ImageTooLargeError,
    InvalidAudioError,
    InvalidImageError,
)
from src.infrastructure.huggingface_client import clasificar_imagen
from src.infrastructure.image_validation import detectar_mime_type
from src.infrastructure.audio_validation import validar_audio_wav
from src.infrastructure.whisper_client import transcribir_audio

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/identificar",
    response_model=IdentificacionResponseSchema,
    summary="Identificar animal en una imagen",
    description=(
        "Recibe una imagen (JPEG, PNG o WebP) y retorna el animal identificado "
        "por el modelo de IA, junto con un score de confianza y candidatos alternativos."
    ),
    responses={
        200: {"description": "Identificación exitosa."},
        422: {"description": "Imagen inválida o modelo sin resultados utilizables."},
        502: {"description": "Error al comunicarse con el servicio de IA (Hugging Face)."},
    },
)
async def identificar_animal_endpoint(
    archivo: UploadFile = File(
        ...,
        description="Imagen del animal a identificar. Formatos: JPEG, PNG, WebP. Máximo 10 MB.",
    ),
) -> IdentificacionResponseSchema:
    """
    POST /api/v1/identificacion/identificar

    Flujo completo:
        1. Lee el binario del archivo subido.
        2. Valida el tamaño máximo permitido.
        3. Valida el tipo MIME real (no confía solo en la extensión o el Content-Type declarado).
        4. Llama al caso de uso `identificar_animal`.
        5. Mapea la entidad de dominio al schema de respuesta.

    El campo `requiere_revision_humana` en la respuesta indica si la app
    móvil debe mostrar una advertencia de baja confianza al usuario.
    """
    settings = get_settings()

    # --- Paso 1: Leer el binario completo ---
    imagen_bytes = await archivo.read()

    # --- Paso 2: Validar tamaño ---
    if len(imagen_bytes) > settings.max_image_size_bytes:
        max_mb = settings.max_image_size_bytes / 1_048_576
        logger.warning(
            "Archivo rechazado por tamaño | tamaño=%d bytes | límite=%d bytes",
            len(imagen_bytes),
            settings.max_image_size_bytes,
        )
        raise ImageTooLargeError(
            message=f"La imagen excede el tamaño máximo permitido de {max_mb:.0f} MB."
        )

    # --- Paso 3: Validar MIME type real ---
    # Se inspecciona el contenido binario, no el Content-Type declarado por el cliente,
    # para prevenir suplantacion de tipo de archivo.
    try:
        mime_type_real = detectar_mime_type(imagen_bytes)
    except Exception as exc:
        logger.error("No se pudo determinar el MIME type del archivo: %s", exc)
        raise InvalidImageError(
            message="No se pudo validar el formato de la imagen enviada."
        ) from exc

    allowed_mime_types = settings.allowed_mime_types_list
    if mime_type_real not in allowed_mime_types:
        logger.warning(
            "Archivo rechazado por MIME type | mime_detectado=%s | permitidos=%s",
            mime_type_real,
            allowed_mime_types,
        )
        raise InvalidImageError(
            message=(
                f"Formato de imagen no soportado: '{mime_type_real}'. "
                f"Formatos permitidos: JPEG, PNG, WebP."
            )
        )

    logger.info(
        "Imagen recibida y validada | nombre=%s | mime=%s | tamaño=%d bytes",
        archivo.filename,
        mime_type_real,
        len(imagen_bytes),
    )

    # --- Paso 4: Ejecutar el caso de uso ---
    try:
        resultado = await identificar_animal(
            imagen_bytes=imagen_bytes,
            mime_type=mime_type_real,
            clasificador_fn=clasificar_imagen,
        )
    except AppError as exc:
        # Mapear excepciones del dominio/infraestructura a respuestas HTTP
        logger.error(
            "AppError durante identificación | tipo=%s | mensaje=%s | detalle=%s",
            type(exc).__name__,
            exc.message,
            exc.detail,
        )
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.message,
        ) from exc

    # --- Paso 5: Mapear dominio → schema de respuesta ---
    return IdentificacionResponseSchema(
        especie_principal=CandidatoEspecieSchema(
            etiqueta=resultado.especie_principal.etiqueta,
            confianza=resultado.especie_principal.confianza,
        ),
        alternativas=[
            CandidatoEspecieSchema(etiqueta=alt.etiqueta, confianza=alt.confianza)
            for alt in resultado.alternativas
        ],
        requiere_revision_humana=resultado.requiere_revision_humana,
        modelo_usado=resultado.modelo_usado,
    )


@router.post(
    "/transcribir",
    response_model=TranscripcionResponseSchema,
    summary="Transcribir audio con Whisper large-v3",
    description=(
        "Recibe un archivo de audio WAV (PCM, mono, 16 kHz) de entre 3 y 5 segundos "
        "y retorna la transcripción generada por openai/whisper-large-v3 vía fal-ai. "
        "Útil para registrar observaciones de campo por voz."
    ),
    responses={
        200: {"description": "Transcripción exitosa."},
        413: {"description": "Archivo de audio demasiado grande (> 10 MB)."},
        422: {"description": "Audio inválido, formato incorrecto o duración fuera de rango (3-5s)."},
        502: {"description": "Error al comunicarse con el servicio de transcripción (Hugging Face)."},
    },
)
async def transcribir_audio_endpoint(
    archivo: UploadFile = File(
        ...,
        description=(
            "Audio WAV PCM (mono, 16 kHz recomendado). "
            "Duración: mínimo 3 segundos, máximo 5 segundos. Tamaño máximo: 10 MB."
        ),
    ),
) -> TranscripcionResponseSchema:
    """
    POST /api/v1/identificacion/transcribir

    Flujo completo:
        1. Lee el binario del archivo de audio.
        2. Valida el tamaño máximo permitido (MAX_AUDIO_SIZE_BYTES).
        3. Valida el formato WAV y la duración (3-5s) inspeccionando la cabecera RIFF.
        4. Llama al caso de uso `transcribir_audio_especie` con Whisper large-v3.
        5. Mapea el resultado al schema de respuesta.

    El campo `requiere_revision_humana` es True si el texto transcripto está vacío
    (audio sin speech inteligible) o si el modelo no pudo procesar el audio.
    """
    settings = get_settings()

    # --- Paso 1: Leer el binario ---
    audio_bytes = await archivo.read()

    # --- Paso 2: Validar tamaño ---
    if len(audio_bytes) > settings.max_audio_size_bytes:
        max_mb = settings.max_audio_size_bytes / 1_048_576
        logger.warning(
            "Audio rechazado por tamaño | tamaño=%d bytes | límite=%d bytes",
            len(audio_bytes),
            settings.max_audio_size_bytes,
        )
        raise AudioTooLargeError(
            message=f"El audio excede el tamaño máximo permitido de {max_mb:.0f} MB."
        )

    # --- Paso 3: Validar formato WAV y duración (3-5s) ---
    try:
        duracion = validar_audio_wav(audio_bytes)
    except InvalidAudioError:
        raise  # Re-propagar con el mensaje descriptivo de la validación
    except Exception as exc:
        logger.error("Error inesperado al validar el audio: %s", exc)
        raise InvalidAudioError(
            message="No se pudo validar el formato del audio enviado."
        ) from exc

    logger.info(
        "Audio recibido y validado | nombre=%s | tamaño=%d bytes | duración=%.2fs",
        archivo.filename,
        len(audio_bytes),
        duracion,
    )

    # --- Paso 4: Ejecutar el caso de uso de transcripción ---
    try:
        resultado = await transcribir_audio_especie(
            audio_bytes=audio_bytes,
            transcriptor_fn=transcribir_audio,
        )
    except AppError as exc:
        logger.error(
            "AppError durante transcripción | tipo=%s | mensaje=%s",
            type(exc).__name__,
            exc.message,
        )
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.message,
        ) from exc

    # --- Paso 5: Mapear dominio → schema de respuesta ---
    return TranscripcionResponseSchema(
        texto=resultado.texto,
        requiere_revision_humana=resultado.requiere_revision_humana,
        modelo_usado=resultado.modelo_usado,
    )

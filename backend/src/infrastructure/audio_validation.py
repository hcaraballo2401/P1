"""
Validación de archivos de audio para la API de transcripción.

Usa la librería `mutagen` para parsear la metadata y duración del audio.
Esto permite validar tanto WAV (generados en iOS) como M4A/AAC (Android),
ya que Expo AV en Android no soporta generar verdaderos archivos WAV PCM.
"""

import io
import logging
import mutagen

from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import InvalidAudioError

logger = logging.getLogger(__name__)


def validar_audio_wav(audio_bytes: bytes) -> float:
    """
    Valida que el binario sea un archivo de audio estructurado
    y que su duración esté dentro del rango permitido por configuración.

    Args:
        audio_bytes: Contenido binario del archivo de audio.

    Returns:
        Duración calculada en segundos (float) si el archivo es válido.

    Raises:
        InvalidAudioError: Si el formato es inválido o la duración no cumple
                           los límites.
    """
    settings = get_settings()

    f = io.BytesIO(audio_bytes)
    # Hint opcional para mutagen en caso de que lo necesite internamente
    f.name = "audio.tmp" 
    
    try:
        m = mutagen.File(f)
    except Exception as exc:
        raise InvalidAudioError(
            message="El archivo enviado no pudo ser parseado como audio."
        ) from exc

    if m is None:
        raise InvalidAudioError(
            message=(
                "El archivo no tiene un formato de audio reconocido. "
                "Se aceptan formatos M4A, WAV, WebM o MP3."
            )
        )

    duracion_segundos = getattr(m.info, "length", 0.0)

    logger.info(
        "Audio parseado con mutagen | formato=%s | duracion=%.2fs",
        type(m).__name__,
        duracion_segundos,
    )

    if duracion_segundos <= 0:
        # Failsafe para formatos sin duración explícita o corruptos
        logger.warning("mutagen no pudo determinar la duración exacta.")

    # --- Validar rango de duración ---
    min_dur = settings.audio_min_duration_seconds
    max_dur = settings.audio_max_duration_seconds

    if duracion_segundos > 0 and duracion_segundos < min_dur:
        raise InvalidAudioError(
            message=(
                f"El audio es demasiado corto ({duracion_segundos:.1f}s). "
                f"Duración mínima requerida: {min_dur:.0f} segundos."
            )
        )

    if duracion_segundos > max_dur:
        raise InvalidAudioError(
            message=(
                f"El audio es demasiado largo ({duracion_segundos:.1f}s). "
                f"Duración máxima permitida: {max_dur:.0f} segundos."
            )
        )

    return duracion_segundos

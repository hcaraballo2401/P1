"""
Utilidades de validacion de imagenes.

Primero intenta usar python-magic (si esta disponible en el sistema) y,
si no puede cargarse, aplica deteccion por firmas binarias conocidas.
"""

from __future__ import annotations


def detectar_mime_type(imagen_bytes: bytes) -> str:
    """
    Detecta el MIME real de una imagen a partir de su contenido binario.

    Returns:
        MIME detectado (ej: image/jpeg), o application/octet-stream si no coincide.
    """
    mime_type = _detectar_con_python_magic(imagen_bytes)
    if mime_type:
        return mime_type
    return _detectar_por_firma(imagen_bytes)


def _detectar_con_python_magic(imagen_bytes: bytes) -> str | None:
    try:
        import magic  # type: ignore
    except Exception:
        return None

    try:
        return magic.from_buffer(imagen_bytes, mime=True)
    except Exception:
        return None


def _detectar_por_firma(imagen_bytes: bytes) -> str:
    # JPEG: FF D8 FF
    if len(imagen_bytes) >= 3 and imagen_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"

    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if len(imagen_bytes) >= 8 and imagen_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"

    # WebP: RIFF....WEBP
    if (
        len(imagen_bytes) >= 12
        and imagen_bytes[:4] == b"RIFF"
        and imagen_bytes[8:12] == b"WEBP"
    ):
        return "image/webp"

    return "application/octet-stream"

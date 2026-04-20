"""
Excepciones personalizadas del sistema de identificación de biodiversidad.

Jerarquía:
    AppError (base)
    ├── HuggingFaceAPIError   — Fallos de red o respuestas de error de HF
    ├── InvalidImageError     — MIME inválido, tamaño excedido o imagen corrupta
    └── IdentificationFailedError — La IA no retornó resultados utilizables
"""


class AppError(Exception):
    """
    Clase base para todos los errores de aplicación controlados.

    Attributes:
        message: Mensaje legible para el usuario final.
        status_code: Código HTTP sugerido para la respuesta al cliente.
        detail: Información técnica adicional (opcional, para logs internos).
    """

    def __init__(
        self,
        message: str,
        status_code: int = 500,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.detail = detail


class HuggingFaceAPIError(AppError):
    """
    Se lanza cuando la Hugging Face Inference API responde con un error
    o cuando la petición falla por problemas de red / timeout.

    Args:
        message: Descripción del problema.
        hf_status_code: Código HTTP recibido de Hugging Face (si está disponible).
    """

    def __init__(
        self,
        message: str = "Error al comunicarse con el servicio de IA.",
        hf_status_code: int | None = None,
    ) -> None:
        detail = f"HF HTTP status: {hf_status_code}" if hf_status_code else None
        super().__init__(message=message, status_code=502, detail=detail)
        self.hf_status_code = hf_status_code


class InvalidImageError(AppError):
    """
    Se lanza cuando la imagen enviada no cumple los requisitos de validación:
    - Tipo MIME no permitido (no es JPEG, PNG o WebP)
    - Tamaño de archivo excede el límite configurado
    - El binario no corresponde a una imagen válida

    Args:
        message: Descripción específica del problema de validación.
    """

    def __init__(
        self,
        message: str = "La imagen proporcionada no es válida.",
    ) -> None:
        super().__init__(message=message, status_code=422)


class ImageTooLargeError(AppError):
    """
    Se lanza cuando la imagen supera el límite máximo permitido.

    Se expone como HTTP 413 (Payload Too Large) para que el frontend
    pueda mostrar un mensaje específico y evitar reintentos inútiles.
    """

    def __init__(
        self,
        message: str = "La imagen excede el tamaño máximo permitido.",
    ) -> None:
        super().__init__(message=message, status_code=413)


class IdentificationFailedError(AppError):
    """
    Se lanza cuando Hugging Face retorna una respuesta vacía o malformada
    que impide construir un ResultadoIdentificacion coherente.

    Nota: Una confianza baja NO lanza esta excepción; en su lugar,
    el campo `requiere_revision_humana` se establece en True.
    Esta excepción es para fallos estructurales de la respuesta.

    Args:
        message: Descripción del fallo de identificación.
    """

    def __init__(
        self,
        message: str = "El modelo de IA no pudo procesar la imagen. Requiere revisión humana.",
    ) -> None:
        super().__init__(message=message, status_code=422)

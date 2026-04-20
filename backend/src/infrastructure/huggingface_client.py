"""
Cliente HTTP asíncrono para la Hugging Face Inference API.

Responsabilidad: Única — enviar el binario de una imagen al modelo de
clasificación configurado y retornar la lista cruda de predicciones.

Desacoplamiento: Este módulo NO conoce el dominio. No sabe qué es un
"animal" ni qué significa "confianza baja". Solo comunica con HF y
transforma la respuesta en una estructura Python básica.
"""

import logging
import asyncio
import random
from typing import Any

import httpx

from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import HuggingFaceAPIError, IdentificationFailedError

logger = logging.getLogger(__name__)


async def clasificar_imagen(imagen_bytes: bytes, mime_type: str = "image/jpeg") -> list[dict[str, Any]]:
    """
    Envía el binario de una imagen a la Hugging Face Inference API y retorna
    la lista de predicciones ordenadas por confianza descendente.

    La API de HF para Image Classification responde con el formato:
        [{"label": "tabby cat", "score": 0.9823}, ...]

    Args:
        imagen_bytes: Contenido binario de la imagen a clasificar.
                      Debe ser una imagen JPEG, PNG o WebP válida.

    Returns:
        Lista de dicts con claves `label` (str) y `score` (float),
        ordenada de mayor a menor confianza.

    Raises:
        HuggingFaceAPIError: Si la API retorna un código de error HTTP,
                             si el timeout es excedido, o si hay un fallo de red.
        IdentificationFailedError: Si la respuesta de HF está vacía o
                                   tiene un formato inesperado.
    """
    settings = get_settings()
    # Prioridad:
    #   1) HF_API_URL (URL completa)
    #   2) URL construida con HF_MODEL_ID en el router gratuito
    url = (
        settings.hf_api_url.rstrip("/")
        if settings.hf_api_url
        else f"https://router.huggingface.co/hf-inference/models/{settings.hf_model_id}"
    )
    headers = {
        "Authorization": f"Bearer {settings.hf_api_token}",
        "Content-Type": mime_type,
    }

    # Hugging Face devuelve 503 cuando el modelo está cargando ("cold start").
    # Reintentar reduce la fricción para la primera petición (o después de inactividad).
    max_retries_503 = 5
    backoff_base_seconds = 1.0

    logger.info(
        "Enviando imagen a Hugging Face | modelo=%s | tamaño=%d bytes",
        settings.hf_model_id,
        len(imagen_bytes),
    )

    for intento in range(1, max_retries_503 + 1):
        try:
            async with httpx.AsyncClient(timeout=settings.hf_timeout_seconds) as client:
                response = await client.post(url, headers=headers, content=imagen_bytes)
        except httpx.TimeoutException as exc:
            logger.error("Timeout al conectar con Hugging Face: %s", exc)
            raise HuggingFaceAPIError(
                message="El servicio de IA tardó demasiado en responder. Intenta nuevamente.",
            ) from exc
        except httpx.RequestError as exc:
            logger.error("Error de red al contactar Hugging Face: %s", exc)
            raise HuggingFaceAPIError(
                message="No se pudo conectar con el servicio de IA.",
            ) from exc

        if response.status_code == 503:
            if intento >= max_retries_503:
                logger.warning(
                    "Modelo de HF en cold start y se agotaron reintentos | intento=%d/%d",
                    intento,
                    max_retries_503,
                )
                raise HuggingFaceAPIError(
                    message="El modelo de IA se está iniciando. Espera unos segundos y vuelve a intentarlo.",
                    hf_status_code=503,
                )

            # Backoff exponencial con pequeño jitter para evitar thundering herd.
            backoff_seconds = backoff_base_seconds * (2 ** (intento - 1)) + random.uniform(0, 0.25)
            logger.warning(
                "HF respondió 503 (cold start). Reintentando | intento=%d/%d | espera=%.2fs",
                intento,
                max_retries_503,
                backoff_seconds,
            )
            await asyncio.sleep(backoff_seconds)
            continue

        if not response.is_success:
            logger.error(
                "Respuesta de error de Hugging Face | status=%d | body=%s",
                response.status_code,
                response.text[:500],  # Limitar longitud para evitar logs masivos
            )
            raise HuggingFaceAPIError(
                message="El servicio de IA retornó un error inesperado.",
                hf_status_code=response.status_code,
            )

        predicciones: Any = response.json()

        # Validar que la respuesta sea una lista no vacía con la forma esperada
        if not isinstance(predicciones, list) or len(predicciones) == 0:
            logger.error(
                "Respuesta de HF con formato inesperado: %s",
                type(predicciones).__name__,
            )
            raise IdentificationFailedError(
                message="El modelo de IA no retornó predicciones válidas para esta imagen."
            )

        logger.info(
            "Predicciones recibidas de HF | cantidad=%d | top_label=%s | top_score=%.4f",
            len(predicciones),
            predicciones[0].get("label", "N/A"),
            predicciones[0].get("score", 0.0),
        )

        return predicciones

    # Nunca debería llegar aquí (el `return` ocurre en el primer 2xx),
    # pero lo dejamos como defensa.
    raise HuggingFaceAPIError(
        message="No se pudo obtener predicciones del modelo de Hugging Face.",
    )

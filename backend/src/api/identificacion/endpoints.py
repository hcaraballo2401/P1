"""
Endpoints del dominio de Identificación Animal.

Responsabilidad única: Recibir la petición HTTP, validar el archivo,
coordinar el flujo del caso de uso, y retornar la respuesta al cliente.

NO contiene lógica de negocio. Solo traduce entre HTTP y el dominio.

Endpoints:
    POST /identificar  — Imagen → identificación de especie (IA visual)
"""

import asyncio
import base64
import logging

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from src.api.identificacion.schemas import (
    CandidatoEspecieSchema,
    IdentificacionResponseSchema,
)
from src.identificacion_animal.casos_de_uso import identificar_animal
from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import (
    AppError,
    ImageTooLargeError,
    InvalidImageError,
)
from src.infrastructure.huggingface_client import clasificar_imagen
from src.infrastructure.image_validation import detectar_mime_type

logger = logging.getLogger(__name__)

router = APIRouter()

async def consultar_gemma(imagen_bytes: bytes, mime_type: str, api_key: str | None) -> str:
    if not api_key:
        return "API Key de Novita no configurada."
    
    try:
        base64_img = base64.b64encode(imagen_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{base64_img}"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.novita.ai/v3/openai/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "google/gemma-4-31b-it",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Actúa como un experto en zoología y biodiversidad de la región de la Guayana Venezolana. Identifica el animal de esta imagen, priorizando especies nativas de los estados Bolívar, Amazonas y Delta Amacuro. Responde estrictamente en el siguiente formato, sin texto adicional:\nNombre científico: [Nombre]"
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": data_url
                                    }
                                }
                            ]
                        }
                    ]
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error("Error consultando Gemma: %s", e)
        return "Error al consultar Gemma"


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

    # --- Paso 4: Ejecutar el caso de uso y modelo secundario en paralelo ---
    try:
        resultado_task = identificar_animal(
            imagen_bytes=imagen_bytes,
            mime_type=mime_type_real,
            clasificador_fn=clasificar_imagen,
        )
        gemma_task = consultar_gemma(
            imagen_bytes=imagen_bytes,
            mime_type=mime_type_real,
            api_key=settings.novita_api_key,
        )
        
        resultado, gemma_respuesta = await asyncio.gather(resultado_task, gemma_task)
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
        gemma_respuesta=gemma_respuesta,
    )

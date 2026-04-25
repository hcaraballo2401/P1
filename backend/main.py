"""
Punto de entrada principal del backend FastAPI.

Inicializa la aplicación, configura logging, registra el router global,
y configura el handler de excepciones no capturadas.

Levantar en desarrollo:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Para acceder desde el emulador Android (app React Native):
    Usar la IP 10.0.2.2 en lugar de localhost.
    Ejemplo: http://10.0.2.2:8000/api/v1/identificacion/identificar
"""

import logging
import logging.config
import base64

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx

from src.api.router import api_router
from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import AppError, InvalidImageError

# ==============================================================================
# Configuración de Logging
# ==============================================================================
settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

logger = logging.getLogger(__name__)

# ==============================================================================
# Aplicación FastAPI
# ==============================================================================
app = FastAPI(
    title="BioLife — API de Identificación de Biodiversidad",
    description=(
        "Backend para identificación de animales mediante IA (Hugging Face Inference API). "
        "Diseñado con Screaming Architecture para máxima mantenibilidad."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ==============================================================================
# Middleware: CORS
# Permite peticiones desde la app React Native en desarrollo.
# Ajustar origins en producción.
# ==============================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Modificado para evitar bloqueos en despliegue Render
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# Handler global de AppError
# Transforma cualquier AppError no capturado en una respuesta HTTP coherente.
# ==============================================================================
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """
    Handler global para excepciones AppError.

    Garantiza que ningún error interno del dominio llegue al cliente
    como un 500 genérico. Todos los errores controlados tienen un
    mensaje legible y un código HTTP apropiado.
    """
    logger.error(
        "AppError no capturado | path=%s | tipo=%s | mensaje=%s",
        request.url.path,
        type(exc).__name__,
        exc.message,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


# ==============================================================================
# Routers
# ==============================================================================
app.include_router(api_router)


# ==============================================================================
# Health Check y Ruta Raiz
# ==============================================================================
@app.get("/")
def read_root():
    return {"status": "Backend en Render funcionando"}


@app.get("/health", tags=["Sistema"], summary="Estado del servidor")
async def health_check() -> dict:
    """Verifica que el servidor está operativo."""
    return {
        "status": "ok",
        "environment": settings.app_env,
        "modelo_configurado": settings.hf_model_id,
    }


@app.get("/health/hf", tags=["Sistema"], summary="Diagnóstico de conectividad con Hugging Face")
async def health_huggingface() -> dict:
    """
    Verifica conectividad end-to-end hacia Hugging Face:
      1) Valida token con /api/whoami-v2.
      2) Prueba inferencia al modelo configurado.
    """
    hf_url = (
        settings.hf_api_url.rstrip("/")
        if settings.hf_api_url
        else f"https://router.huggingface.co/hf-inference/models/{settings.hf_model_id}"
    )
    headers = {"Authorization": f"Bearer {settings.hf_api_token}"}

    result: dict = {
        "status": "ok",
        "model_id": settings.hf_model_id,
        "hf_url": hf_url,
        "token_check": {"ok": False, "status_code": None},
        "inference_check": {
            "ok": False,
            "status_code": None,
            "reachable": False,
            "accepted_payload": False,
        },
    }

    # PNG 1x1 válido para probar inferencia sin depender de archivos locales.
    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2eQAAAAASUVORK5CYII="
    )

    try:
        async with httpx.AsyncClient(timeout=settings.hf_timeout_seconds) as client:
            whoami_response = await client.get(
                "https://huggingface.co/api/whoami-v2",
                headers=headers,
            )
            result["token_check"]["status_code"] = whoami_response.status_code
            result["token_check"]["ok"] = whoami_response.status_code == 200

            inference_response = await client.post(
                hf_url,
                headers={**headers, "Content-Type": "image/png"},
                content=tiny_png,
            )
            inference_status = inference_response.status_code
            result["inference_check"]["status_code"] = inference_status
            # reachable=True => hay conectividad/red y endpoint válido.
            result["inference_check"]["reachable"] = inference_status not in (401, 403, 404)
            # accepted_payload=True => el modelo procesó la imagen de prueba sin error de formato.
            result["inference_check"]["accepted_payload"] = inference_status in (200, 503)
            result["inference_check"]["ok"] = (
                result["token_check"]["ok"] and result["inference_check"]["reachable"]
            )

            if not result["inference_check"]["accepted_payload"]:
                result["inference_check"]["body_preview"] = inference_response.text[:300]
    except Exception as exc:
        logger.error("Fallo diagnóstico /health/hf: %s", exc)
        result["status"] = "error"
        result["error"] = str(exc)
        return result

    if not result["token_check"]["ok"] or not result["inference_check"]["ok"]:
        result["status"] = "degraded"

    return result


logger.info(
    "BioLife API iniciada | env=%s | modelo=%s",
    settings.app_env,
    settings.hf_model_id,
)

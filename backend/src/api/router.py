"""
Router principal de la API.

Agrega todos los sub-routers de los dominios del sistema bajo el prefijo /api/v1.
Añadir un nuevo dominio solo requiere importar su router y registrarlo aquí.
"""

from fastapi import APIRouter

from src.api.identificacion.endpoints import router as identificacion_router

api_router = APIRouter(prefix="/api/v1")

# Dominio: Identificación Animal
api_router.include_router(
    identificacion_router,
    prefix="/identificacion",
    tags=["Identificación Animal"],
)

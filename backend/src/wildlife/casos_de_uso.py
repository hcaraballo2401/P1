"""
Caso de uso: Buscar transmisiones de vida silvestre.
"""

import logging
from typing import Any
from cachetools import TTLCache
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import AppError

logger = logging.getLogger(__name__)

# Caché global: máximo 100 búsquedas, 20 minutos de TTL
streams_cache = TTLCache(maxsize=100, ttl=1200)

async def buscar_streams_youtube(animal: str | None, region: str | None) -> list[dict[str, Any]]:
    """
    Busca videos en vivo en YouTube basados en los filtros de animal y región.
    """
    settings = get_settings()
    
    if not settings.youtube_api_key:
        raise AppError(
            message="La API Key de YouTube no está configurada en el servidor.",
            status_code=500
        )
        
    # Construir el query
    query_parts = ["wildlife live cam"]
    if animal:
        query_parts.append(animal)
    if region:
        query_parts.append(region)
        
    query = " ".join(query_parts)
    
    # Revisar caché
    if query in streams_cache:
        logger.info(f"Retornando resultados desde caché para la búsqueda: '{query}'")
        return streams_cache[query]
        
    logger.info(f"Consultando YouTube API para: '{query}'")
    
    try:
        youtube = build("youtube", "v3", developerKey=settings.youtube_api_key)
        
        request = youtube.search().list(
            part="snippet",
            q=query,
            type="video",
            eventType="live",
            maxResults=10
        )
        response = request.execute()
        
        resultados = []
        for item in response.get("items", []):
            resultados.append({
                "video_id": item["id"]["videoId"],
                "title": item["snippet"]["title"],
                "channel_title": item["snippet"]["channelTitle"],
                "thumbnail_url": item["snippet"]["thumbnails"]["high"]["url"]
            })
            
        # Guardar en caché
        streams_cache[query] = resultados
        return resultados
        
    except HttpError as exc:
        logger.error(f"Error de YouTube API: {exc}")
        raise AppError(
            message="Ocurrió un error al consultar las transmisiones en vivo.",
            status_code=502
        ) from exc
    except Exception as exc:
        logger.error(f"Error inesperado buscando streams: {exc}")
        raise AppError(
            message="No se pudieron cargar las cámaras en vivo.",
            status_code=500
        ) from exc

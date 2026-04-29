"""
Endpoints del dominio de Wildlife.
"""

from fastapi import APIRouter, Query
from src.api.wildlife.schemas import StreamResponseSchema, YouTubeStreamSchema
from src.wildlife.casos_de_uso import buscar_streams_youtube

router = APIRouter()

@router.get(
    "/streams",
    response_model=StreamResponseSchema,
    summary="Obtener cámaras en vivo de vida silvestre",
    description="Busca transmisiones en vivo en YouTube filtradas por animal y región."
)
async def obtener_streams(
    animal: str | None = Query(None, description="Especie o tipo de animal (ej: aves, osos)"),
    region: str | None = Query(None, description="Región o lugar (ej: Africa, Amazon)")
) -> StreamResponseSchema:
    
    resultados = await buscar_streams_youtube(animal=animal, region=region)
    
    query_parts = ["wildlife live cam"]
    if animal: query_parts.append(animal)
    if region: query_parts.append(region)
    query_str = " ".join(query_parts)
    
    streams = [
        YouTubeStreamSchema(
            video_id=r["video_id"],
            title=r["title"],
            channel_title=r["channel_title"],
            thumbnail_url=r["thumbnail_url"]
        ) for r in resultados
    ]
    
    return StreamResponseSchema(streams=streams, query=query_str)

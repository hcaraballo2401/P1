"""
Esquemas Pydantic para el dominio de Wildlife (cámaras en vivo).
"""

from pydantic import BaseModel, Field

class YouTubeStreamSchema(BaseModel):
    video_id: str = Field(..., description="ID del video de YouTube")
    title: str = Field(..., description="Título de la transmisión")
    channel_title: str = Field(..., description="Nombre del canal")
    thumbnail_url: str = Field(..., description="URL de la miniatura de alta resolución")

class StreamResponseSchema(BaseModel):
    streams: list[YouTubeStreamSchema] = Field(
        ..., 
        description="Lista de transmisiones en vivo encontradas"
    )
    query: str = Field(
        ...,
        description="La búsqueda que se realizó internamente"
    )

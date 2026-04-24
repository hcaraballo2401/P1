"""
Configuración de la aplicación mediante variables de entorno.

Usa pydantic-settings para cargar, validar y tipar las variables del archivo .env.
Centralizar la configuración aquí evita strings mágicos dispersos en el código.
"""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuración global de la aplicación.

    Todas las variables se cargan desde el archivo `.env` en la raíz del
    proyecto backend. pydantic-settings valida tipos automáticamente,
    por lo que un valor no numérico en `hf_timeout_seconds` causará un
    error descriptivo en el arranque, no en tiempo de ejecución.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Hugging Face — Imagen (clasificación)
    # Soporta ambos nombres para evitar confusión entre snippets:
    # - HF_API_TOKEN (usado en este proyecto)
    # - HF_TOKEN (común en docs oficiales)
    hf_api_token: str = Field(validation_alias=AliasChoices("HF_API_TOKEN", "HF_TOKEN"))
    # URL completa opcional. Si se define, tiene prioridad sobre hf_model_id.
    hf_api_url: str | None = None
    hf_model_id: str = "microsoft/resnet-50"
    hf_timeout_seconds: float = 30.0

    # Hugging Face — Audio (transcripción ASR con Whisper)
    # Modelo Whisper: openai/whisper-large-v3 vía proveedor fal-ai
    hf_whisper_model_id: str = "openai/whisper-large-v3"

    # Validación de imágenes
    max_image_size_bytes: int = 10_485_760  # 10 MB
    allowed_mime_types: str = "image/jpeg,image/png,image/webp"

    # Validación de audio
    max_audio_size_bytes: int = 10_485_760  # 10 MB
    audio_min_duration_seconds: float = 3.0
    audio_max_duration_seconds: float = 5.0

    # Lógica de identificación
    confidence_threshold: float = 0.50
    max_alternatives: int = 3

    # General
    app_env: str = "development"
    log_level: str = "INFO"

    @property
    def allowed_mime_types_list(self) -> list[str]:
        """Retorna la lista de MIME types permitidos desde CSV."""
        raw_items = [item.strip() for item in self.allowed_mime_types.split(",")]
        return [item for item in raw_items if item]


@lru_cache
def get_settings() -> Settings:
    """
    Retorna la instancia singleton de Settings.

    El decorador @lru_cache garantiza que el archivo .env se lea
    una sola vez durante toda la vida del proceso, no en cada petición.
    """
    return Settings()

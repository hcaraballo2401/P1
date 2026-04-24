"""
Esquemas Pydantic para el endpoint de Transcripción de Audio.

Contrato de la API POST /api/v1/identificacion/transcribir.
Independiente de las entidades del dominio para no acoplar la capa
de presentación con la lógica de negocio.
"""

from pydantic import BaseModel, Field


class TranscripcionResponseSchema(BaseModel):
    """
    Respuesta del endpoint POST /api/v1/identificacion/transcribir.

    Contrato con el frontend React Native. Cualquier cambio en este
    schema implica actualizar también las interfaces TypeScript en la app móvil.

    Attributes:
        texto: Texto transcripto por Whisper. Vacío si el audio no contenía
               speech inteligible y se aplicó el failsafe.
        requiere_revision_humana: True si la transcripción está vacía o
                                  si el modelo no pudo procesar el audio.
        modelo_usado: Identificador del modelo HF para trazabilidad científica.
    """

    texto: str = Field(
        ...,
        description="Texto transcripto por el modelo Whisper.",
        examples=["Aquí se puede ver un águila real volando sobre el río."],
    )
    requiere_revision_humana: bool = Field(
        ...,
        description=(
            "True si la transcripción está vacía o el modelo falló. "
            "La app móvil debe mostrar una advertencia al usuario."
        ),
    )
    modelo_usado: str = Field(
        ...,
        description="Identificador del modelo de Hugging Face utilizado.",
        examples=["openai/whisper-large-v3"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "texto": "Aquí se puede ver un águila real volando sobre el río.",
                "requiere_revision_humana": False,
                "modelo_usado": "openai/whisper-large-v3",
            }
        }
    }

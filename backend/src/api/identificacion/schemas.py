"""
Esquemas Pydantic para el endpoint de Identificación Animal.

Estos modelos definen el contrato de la API:
- Qué retorna el backend al frontend (Response schemas).
- Son independientes de las entidades del dominio (evita acoplar
  la capa de presentación con la lógica de negocio).
"""

from pydantic import BaseModel, Field


class CandidatoEspecieSchema(BaseModel):
    """
    Representa un candidato de especie en la respuesta de la API.

    Attributes:
        etiqueta: Nombre de la especie/categoría detectada por el modelo.
        confianza: Score de confianza del modelo (0.0 - 1.0).
    """

    etiqueta: str = Field(
        ...,
        description="Nombre de la especie o categoría detectada por el modelo de IA.",
        examples=["golden eagle", "tabby cat", "green iguana"],
    )
    confianza: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Score de confianza del modelo entre 0.0 y 1.0.",
        examples=[0.9234],
    )


class IdentificacionResponseSchema(BaseModel):
    """
    Respuesta completa del endpoint POST /api/v1/identificar.

    Contrato con el frontend React Native. Cualquier cambio en este
    schema implica actualizar también las interfaces TypeScript en la app móvil.

    Attributes:
        especie_principal: El animal identificado con mayor confianza.
        alternativas: Otras especies posibles, ordenadas por confianza.
        requiere_revision_humana: Si True, la confianza fue insuficiente
                                   y el resultado debe validarse manualmente.
        modelo_usado: Identificador del modelo HF para trazabilidad científica.
    """

    especie_principal: CandidatoEspecieSchema = Field(
        ...,
        description="Animal identificado con mayor confianza por el modelo.",
    )
    alternativas: list[CandidatoEspecieSchema] = Field(
        default_factory=list,
        description="Otras especies posibles, ordenadas por confianza descendente.",
    )
    requiere_revision_humana: bool = Field(
        ...,
        description=(
            "True si la confianza del resultado principal es menor al umbral "
            "configurado. La app móvil debe mostrar una advertencia al usuario."
        ),
    )
    modelo_usado: str = Field(
        ...,
        description="Identificador del modelo de Hugging Face utilizado.",
        examples=["google/vit-base-patch16-224"],
    )
    gemma_respuesta: str | None = Field(
        default=None,
        description="Respuesta generada por el modelo Gemma-4-31B-it usando Novita API.",
        examples=["Nombre común: Águila Real\nNombre científico: Aquila chrysaetos\nReino: Animalia"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "especie_principal": {
                    "etiqueta": "golden eagle",
                    "confianza": 0.8932,
                },
                "alternativas": [
                    {"etiqueta": "bald eagle", "confianza": 0.0621},
                    {"etiqueta": "kite", "confianza": 0.0214},
                ],
                "requiere_revision_humana": False,
                "modelo_usado": "google/vit-base-patch16-224",
                "gemma_respuesta": "Nombre común: Águila Real\nNombre científico: Aquila chrysaetos\nReino: Animalia"
            }
        }
    }

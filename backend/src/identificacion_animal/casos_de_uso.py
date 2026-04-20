"""
Caso de uso: Identificar Animal.

Responsabilidad: Orquestar el flujo completo de identificación:
    1. Llamar al cliente de Hugging Face con el binario de la imagen.
    2. Transformar las predicciones crudas en entidades del dominio.
    3. Aplicar el umbral de confianza para determinar si requiere revisión humana.
    4. Registrar el Confidence Score para trazabilidad científica.

Desacoplamiento: Este caso de uso depende de abstracciones (el cliente HF
se inyecta como callable), lo que facilita el testing con mocks.
"""

import logging
from typing import Any

from src.identificacion_animal.dominio import CandidatoEspecie, ResultadoIdentificacion
from src.infrastructure.config import get_settings
from src.infrastructure.exceptions import IdentificationFailedError

logger = logging.getLogger(__name__)

# Tipo del cliente HF para facilitar testing por inyección de dependencias
type ClasificadorFn = Any  # callable asíncrono: (bytes, str) -> list[dict]


async def identificar_animal(
    imagen_bytes: bytes,
    mime_type: str,
    clasificador_fn: ClasificadorFn,
) -> ResultadoIdentificacion:
    """
    Caso de uso principal: identifica el animal en una imagen.

    Implementa el principio Failsafe diseñado en la arquitectura:
    si la confianza es baja, NO lanza excepción — marca el resultado
    como `requiere_revision_humana = True` para que el flujo continúe
    sin interrumpir la experiencia del usuario.

    Args:
        imagen_bytes: Binario de la imagen a analizar.
        clasificador_fn: Función asíncrona que llama a la API de clasificación.
                         Firma esperada: async (bytes) -> list[dict[str, Any]]
                         Donde cada dict tiene las claves "label" y "score".

    Returns:
        ResultadoIdentificacion con la especie principal, alternativas,
        flag de revisión humana, y nombre del modelo usado.

    Raises:
        IdentificationFailedError: Si las predicciones no tienen el formato
                                   esperado o la lista está vacía.
        HuggingFaceAPIError: Propagada desde el clasificador si hay fallos de red.
    """
    settings = get_settings()

    # 1. Obtener predicciones crudas del modelo de IA
    predicciones_crudas: list[dict[str, Any]] = await clasificador_fn(imagen_bytes, mime_type)

    # 2. Transformar y validar cada predicción
    candidatos: list[CandidatoEspecie] = _parsear_predicciones(predicciones_crudas)

    # 3. Seleccionar el candidato principal (mayor confianza — HF ya los ordena)
    principal = candidatos[0]

    # 4. Aplicar umbral de confianza (Failsafe)
    confianza_suficiente = principal.confianza >= settings.confidence_threshold
    requiere_revision = not confianza_suficiente

    # 5. Registrar el log de confianza (requerido por la arquitectura para auditoría)
    logger.info(
        "Identificación completada | especie=%s | confianza=%.4f | "
        "umbral=%.2f | requiere_revision=%s | modelo=%s",
        principal.etiqueta,
        principal.confianza,
        settings.confidence_threshold,
        requiere_revision,
        settings.hf_model_id,
    )

    if requiere_revision:
        logger.warning(
            "Confianza insuficiente (%.4f < %.2f) — marcado para revisión humana.",
            principal.confianza,
            settings.confidence_threshold,
        )

    # 6. Preparar lista de alternativas (excluye al candidato principal)
    alternativas = candidatos[1 : settings.max_alternatives + 1]

    return ResultadoIdentificacion(
        especie_principal=principal,
        alternativas=alternativas,
        requiere_revision_humana=requiere_revision,
        modelo_usado=settings.hf_model_id,
    )


def _parsear_predicciones(predicciones_crudas: list[dict]) -> list[CandidatoEspecie]:
    """
    Transforma la respuesta cruda de Hugging Face en entidades del dominio.

    Hugging Face retorna: [{"label": "str", "score": float}, ...]
    Este método valida que cada entrada tenga las claves esperadas antes
    de construir la entidad, evitando errores de KeyError en producción.

    Args:
        predicciones_crudas: Lista de dicts de la respuesta de HF.

    Returns:
        Lista de CandidatoEspecie ordenada por confianza descendente.

    Raises:
        IdentificationFailedError: Si alguna entrada tiene formato inválido.
    """
    candidatos: list[CandidatoEspecie] = []

    for entrada in predicciones_crudas:
        etiqueta = entrada.get("label")
        score = entrada.get("score")

        if not isinstance(etiqueta, str) or not isinstance(score, float):
            logger.error(
                "Predicción con formato inválido descartada: %s", entrada
            )
            raise IdentificationFailedError(
                message="El modelo retornó predicciones con un formato inesperado."
            )

        candidatos.append(CandidatoEspecie(etiqueta=etiqueta, confianza=score))

    if not candidatos:
        raise IdentificationFailedError(
            message="No se encontraron candidatos válidos en la respuesta del modelo."
        )

    return candidatos

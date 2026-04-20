"""
Entidades del dominio de Identificación Animal.

Este módulo define los conceptos PUROS del dominio:
- No importa FastAPI, httpx, ni ninguna librería de infraestructura.
- Las clases aquí son simples estructuras de datos Python.
- Esto garantiza que la lógica de negocio sea testeable de forma aislada.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CandidatoEspecie:
    """
    Representa una especie candidata sugerida por el modelo de IA.

    Attributes:
        etiqueta: Nombre de la especie o categoría tal como lo reporta el modelo.
                  Ejemplos: "tabby cat", "golden eagle", "green iguana".
        confianza: Score de confianza del modelo, entre 0.0 (nada seguro)
                   y 1.0 (completamente seguro).
    """

    etiqueta: str
    confianza: float

    def __post_init__(self) -> None:
        if not (0.0 <= self.confianza <= 1.0):
            raise ValueError(
                f"El score de confianza debe estar entre 0.0 y 1.0. "
                f"Recibido: {self.confianza}"
            )


@dataclass(frozen=True)
class ResultadoIdentificacion:
    """
    Resultado final del caso de uso de identificación de un animal.

    Encapsula toda la información necesaria para que:
    1. El frontend muestre el resultado al usuario.
    2. El sistema decida si necesita revisión humana.
    3. El dato sea exportable en formato Darwin Core (DwC) en el futuro.

    Attributes:
        especie_principal: El candidato con mayor confianza según el modelo.
        alternativas: Candidatos adicionales ordenados por confianza descendente.
                      Útil para mostrar "¿Podría ser también...?" en la UI.
        requiere_revision_humana: True si la confianza de `especie_principal`
                                  es menor al umbral configurado. Implementa
                                  el principio de Failsafe de la arquitectura.
        modelo_usado: Identificador del modelo HF utilizado.
                      Necesario para trazabilidad científica y auditoría del dataset.
    """

    especie_principal: CandidatoEspecie
    alternativas: list[CandidatoEspecie] = field(default_factory=list)
    requiere_revision_humana: bool = False
    modelo_usado: str = ""

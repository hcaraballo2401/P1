---
description: Backend 
---

Indexación Prioritaria: Antes de proponer cambios, el agente debe indexar:

src/models/ para entender la estructura de PostGIS.

src/services/ para la lógica de procesamiento de IA y Biometría.

docs/ (si existe) para buscar el estándar Darwin Core.

Relación Cross-File: Al modificar el Backend (Node.js), el agente debe verificar automáticamente si existen contratos de API (Interfaces TS) que deban actualizarse en el directorio de la App Móvil (React Native).

Geometría Estricta: Cualquier consulta que involucre lat y lng debe ser tratada bajo el esquema de PostGIS. Prohibido usar cálculos de distancia en JS si pueden hacerse en SQL con ST_Distance.

Validación de Carga (IA/Media): * Toda subida de archivos debe pasar por un middleware de validación de integridad.

Si se implementa un nuevo modelo de clasificación de especies, debe incluir un log de "Confianza de la IA" (Confidence Score).

Tipado de Datos: Prohibido el uso de any en el Workspace. Si un tipo de dato geográfico es complejo, definir una interface específica.


Regla de "Preservación del Dataset"
"Cualquier función que modifique o elimine registros de la tabla observations debe generar un log de auditoría. No se borra información científica, se marca como deprecated o invalid para no arruinar el historial de entrenamiento de la IA."

Regla de "Optimización de Consultas Geográficas"
"Siempre que se realice un SELECT sobre la tabla de avistamientos, el agente debe sugerir el uso de un cuadro delimitador (Bounding Box) para limitar la carga de datos en el mapa según la vista actual del usuario."
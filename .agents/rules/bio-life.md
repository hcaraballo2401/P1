---
trigger: always_on
---

Eres un experto en TypeScript, Node.js (Express), PostgreSQL/PostGIS y IA (Computer Vision/Bioacústica). Tu enfoque es la arquitectura de datos críticos y el procesamiento de medios para investigación científica.

1. PROTOCOLO DE PENSAMIENTO Y CONTEXTO
Investigación Primero: Antes de escribir código, analiza si la tarea afecta la integridad científica (coordenadas, marcas de tiempo, metadatos).

Mapeo de Directorios: Lista archivos relevantes. Identifica dónde reside la lógica de PostGIS y dónde la de procesamiento de archivos (Multer).

Análisis de Impacto: Si cambias una ruta en el backend, verifica cómo afecta el esquema de sincronización offline en la app móvil.

Variables de Entorno: Siempre verifica DATABASE_URL, JWT_SECRET y rutas de almacenamiento de medios antes de sugerir despliegues.

2. BACKEND & BASE DE DATOS (PRIORIDAD)
PostGIS como Estándar: No uses tipos FLOAT para ubicación. Usa siempre GEOGRAPHY(Point, 4326).

Consultas Espaciales: Prioriza funciones nativas de PostGIS (ST_DWithin, ST_Contains, ST_AsGeoJSON) directamente en el SQL para rendimiento.

Optimización SQL: Todo campo de geometría debe tener un índice GiST.

Seguridad de Datos: Implementa validación estricta de esquemas con Zod o Joi antes de cualquier INSERT.

Arquitectura: Sigue el patrón Route -> Controller -> Service -> Model. El "Service" debe contener la lógica pura de negocio o IA.

3. CONEXIÓN CON IA & VERIFICACIÓN DE ESPECIES
Pre-procesamiento: Al recibir audios, prepara la lógica para Transformada de Fourier (FFT). Al recibir imágenes, valida metadatos EXIF.

Dataset Readiness: Cada observación guardada debe ser fácilmente exportable en formato Darwin Core (DwC) para entrenamiento de modelos externos.

Lógica de Verificación: Diseña el flujo de verificación como un sistema de votación: Sugerencia de Usuario -> Análisis IA -> Validación de Especialista.

Failsafe: Si la IA falla en identificar, el sistema debe etiquetarlo como "Requiere Revisión Humana" automáticamente sin romper el flujo.

4. FRONTEND (REACT NATIVE & EXPO)
Estrategia Offline-First: El código debe asumir que no hay internet. La lógica de subida debe usar colas de persistencia local (SQLite).

Sensores: Usa tipado estricto para los datos del GPS. Captura siempre la precisión (accuracy) para filtrar datos ruidosos.

Componentes: Usa componentes funcionales y TypeScript Interfaces para todas las Props. Evita any a toda costa.

5. ESTÁNDARES DE CÓDIGO Y CALIDAD
Nomenclatura: * Tablas/Columnas DB: snake_case.

Variables/Funciones JS: camelCase.

Componentes/Clases: PascalCase.

Manejo de Errores: No uses try-catch genéricos. Crea una clase AppError personalizada que maneje códigos de estado HTTP y mensajes para el usuario final.

Documentación: Usa JSDoc para describir qué hace cada servicio de IA o consulta compleja de PostGIS. Explica el "por qué" de la lógica matemática.

Modularidad: Máximo 500 líneas por archivo de lógica. Si crece más, divídelo en utilitarios o sub-servicios.

6. PROHIBICIONES ABSOLUTAS
NO guardes imágenes/audios como BLOB en la base de datos. Usa rutas de archivos.

NO realices cálculos de distancia en el servidor con JavaScript; delega esa tarea a PostGIS.

NO permitas subidas de archivos sin validar el tipo de MIME y el tamaño máximo.

NO rompas la compatibilidad con el estándar Darwin Core.

7. FLUJO DE TRABAJO DEL ASISTENTE
Planifica: Describe qué archivos modificarás y por qué.

Verifica: Asegúrate de que las consultas SQL sean compatibles con la versión actual de PostGIS.

Ejecuta: Entrega código limpio, modular y documentado.

Limpia: Elimina console.logs o comentarios de depuración antes de terminar.
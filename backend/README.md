# Backend FastAPI - Identificacion de Biodiversidad

API para identificar animales a partir de imagenes usando Hugging Face Inference API.

## 1) Requisitos

- Python 3.12+
- Dependencias del backend
- Archivo `.env` basado en `.env.example`

## 2) Instalacion

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

## 3) Configuracion

1. Copia el archivo de ejemplo:

```bash
copy .env.example .env
```

2. Edita `.env` y define al menos:

- `HF_API_TOKEN`
- `HF_MODEL_ID` (por defecto `microsoft/resnet-50`)

## 4) Ejecutar servidor

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Documentacion interactiva:
- http://127.0.0.1:8000/docs
- http://127.0.0.1:8000/redoc

## 5) Endpoints

- `GET /health`
- `POST /api/v1/identificacion/identificar` (`multipart/form-data`, campo `archivo`)

## 6) Ejemplo desde React Native

```ts
const apiBaseUrl = "http://10.0.2.2:8000"; // emulador Android

async function identificarAnimal(uri: string) {
  const formData = new FormData();
  formData.append("archivo", {
    uri,
    name: "animal.jpg",
    type: "image/jpeg",
  } as any);

  const response = await fetch(
    `${apiBaseUrl}/api/v1/identificacion/identificar`,
    {
      method: "POST",
      body: formData,
      // No setear Content-Type manualmente para que RN agregue boundary.
    }
  );

  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(errorBody.detail ?? "Error identificando animal");
  }

  return response.json();
}
```

Respuesta esperada:

```json
{
  "especie_principal": { "etiqueta": "tabby cat", "confianza": 0.91 },
  "alternativas": [
    { "etiqueta": "tiger cat", "confianza": 0.06 },
    { "etiqueta": "lynx", "confianza": 0.02 }
  ],
  "requiere_revision_humana": false,
  "modelo_usado": "microsoft/resnet-50"
}
```

## 7) Tests de integracion

```bash
pytest -q
```

Incluyen:
- health check
- identificacion exitosa
- validacion de formato invalido
- manejo de error de Hugging Face

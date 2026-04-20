import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Garantiza que Settings pueda inicializar incluso en entornos de CI sin .env
os.environ.setdefault("HF_API_TOKEN", "hf_test_token")

from main import app
from src.api.identificacion import endpoints
from src.infrastructure.exceptions import HuggingFaceAPIError


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.mark.asyncio
async def test_identificar_animal_ok(monkeypatch: pytest.MonkeyPatch, client: AsyncClient):
    async def fake_clasificar_imagen(_: bytes, __: str = ""):
        return [
            {"label": "tabby cat", "score": 0.91},
            {"label": "tiger cat", "score": 0.06},
            {"label": "lynx", "score": 0.02},
        ]

    monkeypatch.setattr(endpoints, "detectar_mime_type", lambda *_args, **_kwargs: "image/jpeg")
    monkeypatch.setattr(endpoints, "clasificar_imagen", fake_clasificar_imagen)

    files = {"archivo": ("animal.jpg", b"fake-jpeg-bytes", "image/jpeg")}
    response = await client.post("/api/v1/identificacion/identificar", files=files)

    assert response.status_code == 200
    payload = response.json()
    assert payload["especie_principal"]["etiqueta"] == "tabby cat"
    assert payload["especie_principal"]["confianza"] == pytest.approx(0.91)
    assert payload["modelo_usado"]
    assert isinstance(payload["requiere_revision_humana"], bool)
    assert len(payload["alternativas"]) >= 1


@pytest.mark.asyncio
async def test_identificar_animal_formato_invalido(monkeypatch: pytest.MonkeyPatch, client: AsyncClient):
    monkeypatch.setattr(endpoints, "detectar_mime_type", lambda *_args, **_kwargs: "application/pdf")

    files = {"archivo": ("archivo.pdf", b"%PDF-test", "application/pdf")}
    response = await client.post("/api/v1/identificacion/identificar", files=files)

    assert response.status_code == 422
    assert "Formato de imagen no soportado" in response.json()["detail"]


@pytest.mark.asyncio
async def test_identificar_animal_error_hugging_face(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient
):
    async def fake_clasificar_imagen(_: bytes, __: str = ""):
        raise HuggingFaceAPIError(message="Fallo upstream en HF", hf_status_code=503)

    monkeypatch.setattr(endpoints, "detectar_mime_type", lambda *_args, **_kwargs: "image/jpeg")
    monkeypatch.setattr(endpoints, "clasificar_imagen", fake_clasificar_imagen)

    files = {"archivo": ("animal.jpg", b"fake-jpeg-bytes", "image/jpeg")}
    response = await client.post("/api/v1/identificacion/identificar", files=files)

    assert response.status_code == 502
    assert response.json()["detail"] == "Fallo upstream en HF"


@pytest.mark.asyncio
async def test_health_ok(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

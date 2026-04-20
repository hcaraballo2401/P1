# BioLife Backend Starter for Windows
# Este script asegura que se use el entorno virtual correcto y levanta el servidor.

Write-Host "--- Iniciando BioLife Backend (FastAPI) ---" -ForegroundColor Cyan

if (-Not (Test-Path ".\.venv")) {
    Write-Host "ERROR: No se encontró la carpeta .venv. Ejecuta 'python -m venv .venv' primero." -ForegroundColor Red
    exit
}

Write-Host "Activando entorno virtual y levantando servidor..." -ForegroundColor Green
& .\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

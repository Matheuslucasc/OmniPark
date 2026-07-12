@echo off
cd /d "%~dp0"

if not exist venv\Scripts\python.exe (
    echo O leitor ainda nao foi instalado nesta maquina.
    echo Execute primeiro: instalar.bat
    pause
    exit /b 1
)

if not exist .env (
    echo Arquivo .env nao encontrado. Copie o .env.example para .env
    echo e preencha a URL do sistema e a camera.
    pause
    exit /b 1
)

echo ==============================================
echo   OmniPark - Leitor de placas
echo   Feche esta janela (ou aperte Q no video)
echo   para parar o leitor.
echo ==============================================
venv\Scripts\python -u leitor_placas.py
pause

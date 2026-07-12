@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   OmniPark - Instalacao do Leitor de Placas
echo ==============================================
echo.

rem ---- Localiza um Python compativel (3.10 a 3.12) ----
set "PYTHON="
py -3.11 --version >nul 2>&1 && set "PYTHON=py -3.11"
if not defined PYTHON (py -3.12 --version >nul 2>&1 && set "PYTHON=py -3.12")
if not defined PYTHON (py -3.10 --version >nul 2>&1 && set "PYTHON=py -3.10")
if not defined PYTHON (python --version >nul 2>&1 && set "PYTHON=python")

if not defined PYTHON (
    echo [ERRO] Python nao encontrado nesta maquina.
    echo.
    echo 1. Baixe o Python 3.11 em: https://www.python.org/downloads/
    echo 2. Na instalacao, MARQUE a opcao "Add python.exe to PATH"
    echo 3. Rode este instalador de novo.
    pause
    exit /b 1
)

%PYTHON% -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
if errorlevel 1 (
    echo [ERRO] O Python encontrado e antigo demais. Instale o Python 3.11.
    pause
    exit /b 1
)

echo Python encontrado: %PYTHON%
echo.

echo [1/4] Criando ambiente isolado (venv)...
%PYTHON% -m venv venv
if errorlevel 1 goto :erro

echo [2/4] Instalando dependencias (demora alguns minutos, ~2 GB de download)...
venv\Scripts\python -m pip install --upgrade pip --quiet
venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 goto :erro

echo [3/4] Baixando o modelo de OCR...
venv\Scripts\python -c "from fast_plate_ocr import LicensePlateRecognizer; LicensePlateRecognizer('cct-xs-v2-global-model', device='cpu'); print('Modelo de OCR pronto.')"
if errorlevel 1 goto :erro

echo [4/4] Criando arquivo de configuracao...
if not exist .env copy .env.example .env >nul

echo.
echo ==============================================
echo   Instalacao concluida!
echo.
echo   1. Edite o arquivo .env com o Bloco de Notas:
echo      - OMNIPARK_API_URL (endereco do seu site no Vercel)
echo      - CAMERA_URL (sua camera)
echo   2. Rode: iniciar_leitor.bat
echo ==============================================
pause
exit /b 0

:erro
echo.
echo [ERRO] A instalacao falhou. Confira as mensagens acima
echo (geralmente e falta de internet ou de espaco em disco).
pause
exit /b 1

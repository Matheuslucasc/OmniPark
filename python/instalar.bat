@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   OmniPark - Instalacao do Leitor de Placas
echo ==============================================
echo.

call :findpython
if not defined PYTHON (
    echo Python nao encontrado. Tentando instalar automaticamente...
    where winget >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [ERRO] Nao foi possivel instalar o Python automaticamente.
        echo   1. Baixe o Python 3.11 em: https://www.python.org/downloads/
        echo   2. Na instalacao, MARQUE "Add python.exe to PATH"
        echo   3. Rode este instalador de novo.
        pause
        exit /b 1
    )
    winget install -e --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
    echo Reverificando o Python instalado...
    call :findpython
)

if not defined PYTHON (
    echo.
    echo [AVISO] O Python foi instalado, mas precisa reabrir para ser reconhecido.
    echo Feche esta janela e rode o instalar.bat novamente.
    pause
    exit /b 1
)

echo Python encontrado: %PYTHON%
echo.

echo [1/5] Criando ambiente isolado (venv)...
%PYTHON% -m venv venv
if errorlevel 1 goto :erro

echo [2/5] Instalando dependencias (demora alguns minutos, ~2 GB de download)...
venv\Scripts\python -m pip install --upgrade pip --quiet
venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 goto :erro

echo [3/5] Baixando o modelo de OCR...
venv\Scripts\python -c "from fast_plate_ocr import LicensePlateRecognizer; LicensePlateRecognizer('cct-s-v2-global-model', device='cpu'); print('Modelo de OCR pronto.')"
if errorlevel 1 goto :erro

echo [4/5] Criando arquivos de configuracao...
if not exist .env copy .env.example .env >nul
if not exist mediamtx md mediamtx
if not exist mediamtx\omni.yml if exist mediamtx\omni.yml.example copy mediamtx\omni.yml.example mediamtx\omni.yml >nul

echo [5/5] Baixando o proxy de camera (MediaMTX)...
if exist mediamtx\mediamtx.exe (
    echo    MediaMTX ja presente, ok.
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $u='https://github.com/bluenviron/mediamtx/releases/download/v1.19.2/mediamtx_v1.19.2_windows_amd64.zip'; $z=Join-Path $env:TEMP 'mmtx.zip'; Invoke-WebRequest $u -OutFile $z; Expand-Archive $z 'mediamtx' -Force; Remove-Item $z; Write-Host '   MediaMTX baixado.'"
    if errorlevel 1 (
        echo    [AVISO] Nao consegui baixar o MediaMTX agora. Ele SO e necessario
        echo    se a sua camera nao abrir direto no leitor. Se precisar, rode o
        echo    instalar.bat de novo com internet, ou veja INSTALACAO.md.
    )
)

echo.
echo ==============================================
echo   Instalacao concluida!
echo.
echo   1. Edite o arquivo .env com o Bloco de Notas:
echo      - OMNIPARK_API_URL (endereco do seu site no Vercel)
echo      - OMNIPARK_API_SECRET (a mesma chave do Vercel)
echo   2. Escolha a camera:
echo      - Camera comum: cadastre na aba Cameras do site e deixe
echo        CAMERA_URL vazio no .env.
echo      - Camera que nao abre direto (ex.: chip HI/ONVIF generica):
echo        edite mediamtx\omni.yml com a URL da sua camera e ponha
echo        CAMERA_URL=rtsp://127.0.0.1:8554/cam no .env.
echo        (Detalhes na secao "proxy MediaMTX" do INSTALACAO.md.)
echo   3. Rode: iniciar_leitor.bat
echo ==============================================
pause
exit /b 0

rem ---- Procura um Python 3.10 a 3.12 (via launcher, PATH ou caminhos conhecidos) ----
:findpython
set "PYTHON="
py -3.11 --version >nul 2>&1 && set "PYTHON=py -3.11" && goto :eof
py -3.12 --version >nul 2>&1 && set "PYTHON=py -3.12" && goto :eof
py -3.10 --version >nul 2>&1 && set "PYTHON=py -3.10" && goto :eof
python --version >nul 2>&1 && set "PYTHON=python" && goto :eof
for %%P in (
    "%LocalAppData%\Programs\Python\Python311\python.exe"
    "%LocalAppData%\Programs\Python\Python312\python.exe"
    "%LocalAppData%\Programs\Python\Python310\python.exe"
    "%ProgramFiles%\Python311\python.exe"
    "C:\Python311\python.exe"
) do (
    if exist "%%~P" (
        set PYTHON="%%~P"
        goto :eof
    )
)
goto :eof

:erro
echo.
echo [ERRO] A instalacao falhou. Confira as mensagens acima
echo (geralmente e falta de internet ou de espaco em disco).
pause
exit /b 1

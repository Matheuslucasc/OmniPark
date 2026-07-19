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

rem Sobe o proxy MediaMTX antes do leitor quando o .env usa o proxy: seja fixo
rem (CAMERA_URL=rtsp://127.0.0.1:8554/...) ou controlado pelo site (USAR_PROXY=true).
rem Camera que abre direto (sem proxy) nao precisa disso.
set NEEDPROXY=
findstr /B /I /C:"CAMERA_URL=rtsp://127.0.0.1:8554" .env >nul 2>&1 && set NEEDPROXY=1
findstr /B /I /C:"USAR_PROXY=true" .env >nul 2>&1 && set NEEDPROXY=1
if defined NEEDPROXY (
    if exist mediamtx\mediamtx.exe (
        echo Subindo proxy da camera ^(MediaMTX^)...
        start "MediaMTX" /min mediamtx\mediamtx.exe mediamtx\omni.yml
        timeout /t 4 /nobreak >nul
    ) else (
        echo [AVISO] O .env usa o proxy, mas mediamtx\mediamtx.exe nao existe.
        echo Rode o instalar.bat novamente com internet para baixa-lo.
        timeout /t 4 /nobreak >nul
    )
)

venv\Scripts\python -u leitor_placas.py
pause

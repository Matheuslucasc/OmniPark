"""
OmniPark — Leitor de Placas com YOLO
-------------------------------------
Conecta a uma câmera (IP, USB ou celular via IP Webcam),
usa YOLO para detectar a região da placa e envia para o
sistema OmniPark via API REST.

Instalar dependências:
    pip install ultralytics opencv-python requests python-dotenv

Uso:
    python leitor_placas.py

Configuração: edite o arquivo .env na mesma pasta
"""

import os
import sys
import time
import requests
import cv2
from pathlib import Path
from dotenv import load_dotenv

# Carrega .env da pasta do script
load_dotenv(Path(__file__).parent / ".env")

# ── Configurações ──────────────────────────────────────────────────────────────
API_URL       = os.getenv("OMNIPARK_API_URL",    "https://seu-app.vercel.app/api/plate-read")
API_SECRET    = os.getenv("OMNIPARK_API_SECRET", "")          # mesmo PLATE_API_SECRET do Vercel
CAMERA_URL    = os.getenv("CAMERA_URL",          "0")          # "0"=webcam local, URL=câmera IP
CAMERA_ID     = int(os.getenv("CAMERA_ID",       "1"))
YOLO_MODEL    = os.getenv("YOLO_MODEL",          "yolov8n.pt") # modelo treinado para placas
CONFIANCA_MIN = float(os.getenv("CONFIANCA_MIN", "0.5"))       # descarta detecções abaixo disso
INTERVALO_SEG = float(os.getenv("INTERVALO_SEG", "2.0"))       # analisa 1 frame a cada X segundos
MOSTRAR_VIDEO = os.getenv("MOSTRAR_VIDEO",       "true").lower() == "true"

# ── Importação do YOLO ─────────────────────────────────────────────────────────
try:
    from ultralytics import YOLO
except ImportError:
    print("Erro: instale o ultralytics → pip install ultralytics")
    sys.exit(1)


def enviar_placa(placa: str, confianca: float) -> bool:
    """Envia a placa lida para o OmniPark via API."""
    headers = {"Content-Type": "application/json"}
    if API_SECRET:
        headers["Authorization"] = f"Bearer {API_SECRET}"

    payload = {
        "plate":      placa,
        "confidence": round(confianca, 4),
        "camera_id":  CAMERA_ID,
    }
    try:
        resp = requests.post(API_URL, json=payload, headers=headers, timeout=5)
        if resp.status_code == 200:
            print(f"  ✓ Enviada: {placa} ({confianca:.0%})")
            return True
        else:
            print(f"  ✗ Erro API ({resp.status_code}): {resp.text[:200]}")
    except requests.exceptions.ConnectionError:
        print(f"  ✗ Sem conexão com {API_URL}")
    except requests.exceptions.Timeout:
        print("  ✗ Timeout ao enviar placa")
    return False


def abrir_camera(url: str) -> cv2.VideoCapture:
    """Abre câmera com reconexão automática."""
    src = int(url) if url.isdigit() else url
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise RuntimeError(f"Não foi possível abrir a câmera: {url}")
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


def extrair_texto_placa(frame, box) -> str:
    """
    Recorta a região detectada pelo YOLO e extrai o texto da placa.

    ► Substitua o conteúdo desta função pelo seu modelo de leitura.

    Opção 1 — EasyOCR (instale: pip install easyocr):
        import easyocr
        reader = easyocr.Reader(['pt'], gpu=False)
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        recorte = frame[y1:y2, x1:x2]
        resultado = reader.readtext(recorte, detail=0)
        return resultado[0] if resultado else ""

    Opção 2 — Modelo próprio treinado para placas brasileiras:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        recorte = frame[y1:y2, x1:x2]
        return seu_modelo_de_ocr(recorte)

    Opção 3 — Tesseract (instale: pip install pytesseract):
        import pytesseract
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        recorte = frame[y1:y2, x1:x2]
        texto = pytesseract.image_to_string(recorte, config='--psm 8')
        return texto.strip()
    """
    # Placeholder — retorna string vazia até você implementar
    return ""


def main():
    print("=" * 50)
    print("  OmniPark — Leitor de Placas")
    print("=" * 50)
    print(f"  API:     {API_URL}")
    print(f"  Câmera:  {CAMERA_URL}")
    print(f"  Modelo:  {YOLO_MODEL}")
    print(f"  Intervalo: {INTERVALO_SEG}s")
    print("=" * 50)

    model = YOLO(YOLO_MODEL)
    print(f"  Modelo YOLO carregado: {YOLO_MODEL}\n")

    ultima_placa   = ""
    ultimo_envio   = 0.0
    ultima_analise = 0.0

    while True:
        # ── Conecta/reconecta à câmera ─────────────────────────────────────
        try:
            cap = abrir_camera(CAMERA_URL)
            print(f"Câmera conectada: {CAMERA_URL}")
        except RuntimeError as e:
            print(f"Erro: {e}. Tentando novamente em 5s...")
            time.sleep(5)
            continue

        # ── Loop de captura ────────────────────────────────────────────────
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("Frame perdido. Reconectando...")
                break

            agora = time.time()

            # Exibe o vídeo (opcional)
            if MOSTRAR_VIDEO:
                cv2.imshow("OmniPark — Câmera", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    cap.release()
                    cv2.destroyAllWindows()
                    print("\nEncerrando...")
                    return

            # Analisa apenas 1 frame a cada INTERVALO_SEG segundos
            if agora - ultima_analise < INTERVALO_SEG:
                continue
            ultima_analise = agora

            # ── Detecção YOLO ──────────────────────────────────────────────
            resultados = model(frame, verbose=False)
            melhor_placa     = ""
            melhor_confianca = 0.0

            for r in resultados:
                for box in r.boxes:
                    conf = float(box.conf[0])
                    if conf < CONFIANCA_MIN:
                        continue

                    texto = extrair_texto_placa(frame, box)
                    texto = texto.upper().replace("-", "").replace(" ", "").strip()

                    if len(texto) >= 6 and conf > melhor_confianca:
                        melhor_placa     = texto
                        melhor_confianca = conf

            # ── Envia se for uma placa nova ────────────────────────────────
            if (
                melhor_placa
                and melhor_placa != ultima_placa
                and agora - ultimo_envio > 3.0   # evita envios duplicados em < 3s
            ):
                if enviar_placa(melhor_placa, melhor_confianca):
                    ultima_placa = melhor_placa
                    ultimo_envio = agora

        cap.release()
        time.sleep(2)  # aguarda antes de reconectar

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

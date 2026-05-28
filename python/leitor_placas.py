"""
OmniPark — Leitor de Placas
----------------------------
Fluxo:
  1. Conecta à câmera (USB, IP ou celular via IP Webcam)
  2. YOLO detecta a região da placa no frame
  3. Recorta e salva a foto da placa
  4. Envia placa (texto) + foto (base64) para o OmniPark
  5. Dashboard exibe a foto e a placa automaticamente

Instalar:
    pip install ultralytics opencv-python requests python-dotenv

Configurar: copie .env.example para .env e preencha
Rodar:      python leitor_placas.py
"""

import os
import sys
import time
import base64
import requests
import cv2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# ── Configurações ──────────────────────────────────────────────────────────────
API_URL       = os.getenv("OMNIPARK_API_URL",    "https://seu-app.vercel.app/api/plate-read")
API_SECRET    = os.getenv("OMNIPARK_API_SECRET", "")
CAMERA_URL    = os.getenv("CAMERA_URL",          "0")   # "0"=webcam, URL=câmera IP/celular
CAMERA_ID     = int(os.getenv("CAMERA_ID",       "1"))
YOLO_MODEL    = os.getenv("YOLO_MODEL",          "best.pt")
CONFIANCA_MIN = float(os.getenv("CONFIANCA_MIN", "0.5"))
INTERVALO_SEG = float(os.getenv("INTERVALO_SEG", "2.0"))
MOSTRAR_VIDEO = os.getenv("MOSTRAR_VIDEO",       "true").lower() == "true"
MARGEM_PX     = int(os.getenv("MARGEM_PX",       "20"))  # margem ao redor da placa na foto

try:
    from ultralytics import YOLO
except ImportError:
    print("Erro: instale o ultralytics → pip install ultralytics")
    sys.exit(1)


# ── Funções de imagem ──────────────────────────────────────────────────────────

def recortar_placa(frame: "cv2.Mat", box) -> "cv2.Mat":
    """Recorta a região da placa com margem extra."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = map(int, box.xyxy[0])
    x1 = max(0, x1 - MARGEM_PX)
    y1 = max(0, y1 - MARGEM_PX)
    x2 = min(w, x2 + MARGEM_PX)
    y2 = min(h, y2 + MARGEM_PX)
    return frame[y1:y2, x1:x2]


def imagem_para_base64(imagem: "cv2.Mat") -> str:
    """Converte frame OpenCV para base64 JPEG."""
    _, buf = cv2.imencode(".jpg", imagem, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode("utf-8")


def extrair_texto_placa(recorte: "cv2.Mat") -> str:
    """
    Extrai o texto da placa a partir do recorte.

    ► Implemente aqui com seu modelo de OCR/leitura de placas.

    Exemplos:

    ── EasyOCR (pip install easyocr) ──────────────────────────────────────────
    import easyocr
    _reader = easyocr.Reader(['pt'], gpu=False)
    resultado = _reader.readtext(recorte, detail=0)
    return resultado[0] if resultado else ""

    ── Modelo YOLO próprio para leitura de caracteres ─────────────────────────
    resultado = modelo_ocr(recorte)
    return resultado

    ── Tesseract (pip install pytesseract) ────────────────────────────────────
    import pytesseract
    return pytesseract.image_to_string(recorte, config='--psm 8').strip()
    """
    return ""  # ← substitua pela sua implementação


# ── Envio para a API ───────────────────────────────────────────────────────────

def enviar_para_sistema(placa: str, confianca: float, foto_b64: str) -> bool:
    """Envia placa + foto para o OmniPark."""
    headers = {"Content-Type": "application/json"}
    if API_SECRET:
        headers["Authorization"] = f"Bearer {API_SECRET}"

    payload = {
        "plate":        placa,
        "confidence":   round(confianca, 4),
        "camera_id":    CAMERA_ID,
        "image_base64": foto_b64,
    }
    try:
        resp = requests.post(API_URL, json=payload, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            print(f"  ✓ Enviado → placa: {placa} ({confianca:.0%})"
                  f"  | foto: {'✓' if data.get('image_url') else '✗'}")
            return True
        print(f"  ✗ Erro API {resp.status_code}: {resp.text[:200]}")
    except requests.exceptions.ConnectionError:
        print(f"  ✗ Sem conexão com {API_URL}")
    except requests.exceptions.Timeout:
        print("  ✗ Timeout")
    return False


# ── Loop principal ─────────────────────────────────────────────────────────────

def abrir_camera(url: str) -> "cv2.VideoCapture":
    src = int(url) if url.isdigit() else url
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise RuntimeError(f"Não abriu a câmera: {url}")
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


def main():
    print("=" * 55)
    print("  OmniPark — Leitor de Placas")
    print("=" * 55)
    print(f"  API    : {API_URL}")
    print(f"  Câmera : {CAMERA_URL}")
    print(f"  Modelo : {YOLO_MODEL}")
    print("=" * 55)

    model = YOLO(YOLO_MODEL)
    print(f"  Modelo carregado: {YOLO_MODEL}\n")

    ultima_placa   = ""
    ultimo_envio   = 0.0
    ultima_analise = 0.0

    while True:
        try:
            cap = abrir_camera(CAMERA_URL)
            print(f"Câmera conectada: {CAMERA_URL}\n")
        except RuntimeError as e:
            print(f"Erro: {e}. Tentando em 5s...")
            time.sleep(5)
            continue

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("Frame perdido — reconectando...")
                break

            agora = time.time()

            # Mostra vídeo ao vivo
            if MOSTRAR_VIDEO:
                cv2.imshow("OmniPark — Câmera (Q para sair)", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    cap.release()
                    cv2.destroyAllWindows()
                    return

            # Analisa um frame a cada INTERVALO_SEG segundos
            if agora - ultima_analise < INTERVALO_SEG:
                continue
            ultima_analise = agora

            # ── Detecção YOLO ──────────────────────────────────────────────
            resultados = model(frame, verbose=False)

            melhor_box       = None
            melhor_confianca = 0.0
            melhor_texto     = ""

            for r in resultados:
                for box in r.boxes:
                    conf = float(box.conf[0])
                    if conf < CONFIANCA_MIN:
                        continue

                    recorte = recortar_placa(frame, box)
                    texto   = extrair_texto_placa(recorte)
                    texto   = texto.upper().replace("-", "").replace(" ", "").strip()

                    if conf > melhor_confianca:
                        melhor_confianca = conf
                        melhor_box       = box
                        melhor_texto     = texto

            if not melhor_box:
                continue

            # Recorta a placa com a maior confiança
            recorte_final = recortar_placa(frame, melhor_box)
            foto_b64      = imagem_para_base64(recorte_final)

            # Mostra o recorte separado
            if MOSTRAR_VIDEO:
                cv2.imshow("Placa detectada", recorte_final)

            # Evita enviar a mesma placa repetida em menos de 5s
            nova_placa = melhor_texto or f"LIDA-{int(agora)}"
            if nova_placa == ultima_placa and agora - ultimo_envio < 5:
                continue

            print(f"\n[Detectada] placa={melhor_texto or '?'} conf={melhor_confianca:.0%}")

            if enviar_para_sistema(melhor_texto, melhor_confianca, foto_b64):
                ultima_placa = nova_placa
                ultimo_envio = agora

        cap.release()
        time.sleep(2)

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

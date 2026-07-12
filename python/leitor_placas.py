"""
OmniPark — Leitor de Placas
----------------------------
Fluxo:
  1. Conecta à câmera (USB, IP/RTSP, celular via IP Webcam ou vídeo de teste)
  2. YOLO detecta a região da placa no frame
  3. OCR lê os caracteres e valida o formato brasileiro (antigo e Mercosul)
  4. Votação: a placa só é confirmada após N leituras iguais seguidas
     (descarta erros de OCR de frames borrados)
  5. Anti-duplicação: a mesma placa não é reenviada enquanto o carro
     continuar na frente da câmera; só libera depois que sumir por
     COOLDOWN_S segundos
  6. Envia placa (texto) + foto (base64) para o OmniPark no Vercel

Instalar:  instalar.bat  (ou: pip install -r requirements.txt)
Configurar: copie .env.example para .env e preencha
Rodar:     iniciar_leitor.bat  (ou: python leitor_placas.py)
"""

import base64
import os
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import requests
from dotenv import load_dotenv

from placas import formatar, normalizar

load_dotenv(Path(__file__).parent / ".env")

# ── Configurações ──────────────────────────────────────────────────────────────
API_URL       = os.getenv("OMNIPARK_API_URL",    "https://seu-app.vercel.app/api/plate-read")
API_SECRET    = os.getenv("OMNIPARK_API_SECRET", "")
CAMERA_URL    = os.getenv("CAMERA_URL",          "0")   # "0"=webcam, URL=câmera IP, caminho=vídeo
CAMERA_ID     = int(os.getenv("CAMERA_ID",       "1"))
YOLO_MODEL    = os.getenv("YOLO_MODEL",          str(Path(__file__).parent / "license_plate_detector.pt"))
CONFIANCA_MIN = float(os.getenv("CONFIANCA_MIN", "0.35"))  # confiança mínima do YOLO
CONF_OCR_MIN  = float(os.getenv("CONF_OCR_MIN",  "0.70"))  # confiança mínima do OCR
VOTOS_MIN     = int(os.getenv("VOTOS_MIN",       "3"))     # leituras iguais p/ confirmar
COOLDOWN_S    = float(os.getenv("COOLDOWN_S",    "30"))    # seg. fora da imagem p/ liberar
PULAR_FRAMES  = int(os.getenv("PULAR_FRAMES",    "2"))     # processa 1 a cada N frames
MOSTRAR_VIDEO = os.getenv("MOSTRAR_VIDEO",       "true").lower() == "true"
MARGEM_PCT    = float(os.getenv("MARGEM_PCT",    "0.08"))  # margem ao redor da placa

try:
    from ultralytics import YOLO
except ImportError:
    print("Erro: dependências faltando. Rode instalar.bat")
    sys.exit(1)


# ── Funções de imagem ──────────────────────────────────────────────────────────

def recortar_placa(frame, box):
    """Recorta a região da placa com margem extra (ajuda o OCR)."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = map(int, box.xyxy[0])
    mx = int((x2 - x1) * MARGEM_PCT)
    my = int((y2 - y1) * MARGEM_PCT)
    return frame[max(0, y1 - my):min(h, y2 + my), max(0, x1 - mx):min(w, x2 + mx)]


def imagem_para_base64(imagem) -> str:
    _, buf = cv2.imencode(".jpg", imagem, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode("utf-8")


# ── OCR ────────────────────────────────────────────────────────────────────────

def carregar_ocr():
    from fast_plate_ocr import LicensePlateRecognizer
    return LicensePlateRecognizer("cct-xs-v2-global-model", device="cpu")


def ler_placa(ocr, recorte) -> tuple[str | None, float]:
    """Lê os caracteres do recorte e valida o formato BR.

    Retorna (placa normalizada ou None, confiança média do OCR).
    """
    import numpy as np
    if recorte.size == 0 or recorte.shape[1] < 40:
        return None, 0.0
    try:
        previsoes = ocr.run(recorte, return_confidence=True)
    except Exception as e:
        print(f"  ! Falha no OCR: {e}")
        return None, 0.0
    if not previsoes:
        return None, 0.0
    p = previsoes[0]
    conf = float(np.mean(p.char_probs)) if p.char_probs is not None else 0.0
    return normalizar(p.plate), conf


# ── Envio para a API ───────────────────────────────────────────────────────────

def enviar_para_sistema(placa: str, confianca: float, foto_b64: str) -> bool:
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
            print(f"  ✓ Enviado → {formatar(placa)} ({confianca:.0%})"
                  f"  | foto: {'✓' if data.get('image_url') else '✗'}")
            return True
        print(f"  ✗ Erro API {resp.status_code}: {resp.text[:200]}")
    except requests.exceptions.ConnectionError:
        print(f"  ✗ Sem conexão com {API_URL}")
    except requests.exceptions.Timeout:
        print("  ✗ Timeout")
    return False


# ── Loop principal ─────────────────────────────────────────────────────────────

def abrir_camera(url: str):
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
    print("  Modelo YOLO carregado.")
    ocr = carregar_ocr()
    print("  Modelo de OCR carregado.\n")

    # Vídeo de arquivo (teste) roda em loop na velocidade real.
    eh_arquivo = not CAMERA_URL.isdigit() and \
        not CAMERA_URL.lower().startswith(("rtsp", "http"))

    votos: Counter[str] = Counter()
    ultimo_voto = 0.0
    bloqueadas: dict[str, float] = {}  # placa enviada -> última vez vista
    n_frame = 0

    while True:
        try:
            cap = abrir_camera(CAMERA_URL)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            print(f"Câmera conectada: {CAMERA_URL}\n")
        except RuntimeError as e:
            print(f"Erro: {e}. Tentando em 5s...")
            time.sleep(5)
            continue

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                if eh_arquivo:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                print("Frame perdido — reconectando...")
                break

            n_frame += 1
            agora = time.time()

            if n_frame % PULAR_FRAMES == 0:
                # Sem leitura há 2s: zera a votação (o carro já passou).
                if votos and agora - ultimo_voto > 2.0:
                    votos.clear()

                resultados = model(frame, conf=CONFIANCA_MIN, verbose=False)
                for box in resultados[0].boxes:
                    recorte = recortar_placa(frame, box)
                    placa, conf_ocr = ler_placa(ocr, recorte)

                    if MOSTRAR_VIDEO:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cor = (0, 200, 0) if placa else (0, 165, 255)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), cor, 2)
                        rotulo = f"{formatar(placa)} {conf_ocr:.0%}" if placa else "placa"
                        cv2.putText(frame, rotulo, (x1, max(20, y1 - 8)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, cor, 2)

                    if not placa or conf_ocr < CONF_OCR_MIN:
                        continue

                    # Anti-duplicação: placa já enviada fica bloqueada enquanto
                    # o carro estiver na frente da câmera (mesmo parado).
                    if placa in bloqueadas:
                        if agora - bloqueadas[placa] < COOLDOWN_S:
                            bloqueadas[placa] = agora  # ainda vendo: renova
                            continue
                        del bloqueadas[placa]  # sumiu tempo suficiente: libera

                    votos[placa] += 1
                    ultimo_voto = agora
                    if votos[placa] < VOTOS_MIN:
                        continue

                    # Placa confirmada pela votação: envia.
                    votos.clear()
                    bloqueadas[placa] = agora
                    print(f"\n[CONFIRMADA] {formatar(placa)} conf={conf_ocr:.0%}")
                    enviar_para_sistema(placa, conf_ocr, imagem_para_base64(recorte))

            if MOSTRAR_VIDEO:
                cv2.imshow("OmniPark — Câmera (Q para sair)", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    cap.release()
                    cv2.destroyAllWindows()
                    return

            if eh_arquivo:
                time.sleep(1 / fps)  # simula a velocidade real da câmera

        cap.release()
        time.sleep(2)


if __name__ == "__main__":
    main()

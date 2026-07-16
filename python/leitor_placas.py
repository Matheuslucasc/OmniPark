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
# Câmera fixa (opcional). Vazio = usa a câmera ATIVA definida na aba Câmeras do
# site (buscada pela API). Preencha só para forçar um valor: "0"=webcam,
# uma URL RTSP, ou o caminho de um vídeo gravado (para testes).
CAMERA_URL    = os.getenv("CAMERA_URL", "").strip()
# Endpoint que devolve a câmera ativa; derivado da API_URL trocando o caminho.
CAMERA_API_URL = API_URL.replace("/plate-read", "/active-camera")
# De quanto em quanto tempo checar se a câmera ativa mudou no site (segundos).
CHECAR_CAMERA_S = float(os.getenv("CHECAR_CAMERA_S", "15"))
YOLO_MODEL    = os.getenv("YOLO_MODEL",          str(Path(__file__).parent / "license_plate_detector.pt"))
CONFIANCA_MIN = float(os.getenv("CONFIANCA_MIN", "0.35"))  # confiança mínima do YOLO
CONF_OCR_MIN  = float(os.getenv("CONF_OCR_MIN",  "0.80"))  # confiança mínima do OCR
VOTOS_MIN     = int(os.getenv("VOTOS_MIN",       "4"))     # leituras iguais p/ confirmar
COOLDOWN_S    = float(os.getenv("COOLDOWN_S",    "30"))    # seg. fora da imagem p/ liberar
PULAR_FRAMES  = int(os.getenv("PULAR_FRAMES",    "2"))     # processa 1 a cada N frames
MOSTRAR_VIDEO = os.getenv("MOSTRAR_VIDEO",       "true").lower() == "true"
MARGEM_PCT    = float(os.getenv("MARGEM_PCT",    "0.08"))  # margem ao redor da placa
# Modelo de OCR: "cct-s-v2-global-model" (mais preciso) ou
# "cct-xs-v2-global-model" (mais rápido, menos preciso).
OCR_MODELO    = os.getenv("OCR_MODELO", "cct-s-v2-global-model")
# Largura mínima (px) do recorte da placa para confiar na leitura. Placas
# pequenas/distantes geram leitura errada com confiança falsamente alta.
MIN_LARGURA   = int(os.getenv("MIN_LARGURA_PLACA", "110"))

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
    return LicensePlateRecognizer(OCR_MODELO, device="cpu")


def ler_placa(ocr, recorte) -> tuple[str | None, float]:
    """Lê os caracteres do recorte e valida o formato BR.

    Retorna (placa normalizada ou None, confiança média do OCR).
    """
    import numpy as np
    # Recorte pequeno demais: a leitura seria um chute. Melhor ignorar e
    # esperar o carro chegar mais perto (placa maior no frame).
    if recorte.size == 0 or recorte.shape[1] < MIN_LARGURA:
        return None, 0.0
    # Placa ainda modesta: amplia com interpolação cúbica antes do OCR.
    if recorte.shape[1] < 200:
        escala = 200 / recorte.shape[1]
        recorte = cv2.resize(recorte, None, fx=escala, fy=escala,
                             interpolation=cv2.INTER_CUBIC)
    try:
        previsoes = ocr.run(recorte, return_confidence=True)
    except Exception as e:
        print(f"  ! Falha no OCR: {e}")
        return None, 0.0
    if not previsoes:
        return None, 0.0
    p = previsoes[0]
    if p.char_probs is None:
        return None, 0.0
    probs = np.asarray(p.char_probs, dtype=float)
    conf = float(np.mean(probs))
    # Rejeita se QUALQUER caractere veio com baixa confiança — é aí que mora
    # o erro de 1 letra, que a média mascara.
    if float(np.min(probs)) < 0.55:
        return None, conf
    return normalizar(p.plate), conf


# ── Envio para a API ───────────────────────────────────────────────────────────

def enviar_para_sistema(placa: str, confianca: float, foto_b64: str,
                        camera_id: int | None = None) -> bool:
    headers = {"Content-Type": "application/json"}
    if API_SECRET:
        headers["Authorization"] = f"Bearer {API_SECRET}"

    payload = {
        "plate":        placa,
        "confidence":   round(confianca, 4),
        "image_base64": foto_b64,
    }
    if camera_id is not None:
        payload["camera_id"] = camera_id
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


# ── Fonte da câmera ─────────────────────────────────────────────────────────────

def obter_camera_ativa() -> tuple[str, int | None, str] | None:
    """Consulta a API e devolve (stream_url, camera_id, nome) da câmera ativa,
    ou None se não houver câmera ativa ou a API estiver fora do ar."""
    headers = {}
    if API_SECRET:
        headers["Authorization"] = f"Bearer {API_SECRET}"
    try:
        resp = requests.get(CAMERA_API_URL, headers=headers, timeout=10)
        if resp.status_code != 200:
            print(f"  ✗ /active-camera retornou {resp.status_code}: {resp.text[:120]}")
            return None
        cam = resp.json()
        if not cam:
            return None
        return cam["stream_url"], cam.get("id"), cam.get("name", "câmera")
    except requests.exceptions.RequestException:
        print(f"  ✗ Sem conexão com {CAMERA_API_URL}")
        return None


def resolver_fonte() -> tuple[str, int | None, str]:
    """Decide de onde capturar. Fica tentando até conseguir uma fonte válida.

    - Se CAMERA_URL está preenchido no .env, usa esse valor fixo (id não
      vinculado). Útil para testar com webcam ("0") ou vídeo gravado.
    - Senão, usa a câmera ATIVA definida na aba Câmeras do site.
    """
    if CAMERA_URL:
        return CAMERA_URL, None, "fixa (.env)"
    while True:
        ativa = obter_camera_ativa()
        if ativa:
            return ativa
        print("  Nenhuma câmera ativa no site ainda. Cadastre/ative uma na aba "
              "Câmeras. Checando de novo em 10s...")
        time.sleep(10)


def abrir_camera(url: str):
    src = int(url) if url.isdigit() else url
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise RuntimeError(f"Não abriu a câmera: {url}")
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    # Evita travar para sempre se a câmera cair (ex.: DroidCam vai a segundo
    # plano): a leitura falha em vez de bloquear, e o leitor reconecta.
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 8000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 6000)
    return cap


def main():
    print("=" * 55)
    print("  OmniPark — Leitor de Placas")
    print("=" * 55)
    print(f"  API    : {API_URL}")
    print(f"  Câmera : {CAMERA_URL or 'câmera ativa do site (via API)'}")
    print(f"  Modelo : {YOLO_MODEL}")
    print("=" * 55)

    model = YOLO(YOLO_MODEL)
    print("  Modelo YOLO carregado.")
    ocr = carregar_ocr()
    print("  Modelo de OCR carregado.\n")

    votos: Counter[str] = Counter()
    ultimo_voto = 0.0
    ultimo_aviso = 0.0
    bloqueadas: dict[str, float] = {}  # placa enviada -> última vez vista
    n_frame = 0

    while True:
        fonte, camera_id, nome = resolver_fonte()
        # Vídeo de arquivo (teste) roda em loop na velocidade real.
        eh_arquivo = not fonte.isdigit() and \
            not fonte.lower().startswith(("rtsp", "http"))
        try:
            cap = abrir_camera(fonte)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            print(f"Câmera conectada: {nome} ({fonte})\n")
        except RuntimeError as e:
            print(f"Erro: {e}. Tentando em 5s...")
            time.sleep(5)
            continue

        ultima_checagem = time.time()

        while cap.isOpened():
            # Verifica periodicamente se a câmera ativa mudou no site.
            if not CAMERA_URL and time.time() - ultima_checagem > CHECAR_CAMERA_S:
                ultima_checagem = time.time()
                atual = obter_camera_ativa()
                if atual and atual[0] != fonte:
                    print(f"\nCâmera ativa trocada no site → {atual[2]}. Reconectando...\n")
                    break

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

                    # Placa detectada mas pequena: avisa (no máximo a cada 3s)
                    # para o operador aproximar a câmera.
                    larg = recorte.shape[1] if recorte.size else 0
                    if 0 < larg < MIN_LARGURA and agora - ultimo_aviso > 3.0:
                        print(f"  placa detectada, porém pequena ({larg}px < {MIN_LARGURA}px) "
                              "— aproxime a câmera para ler com segurança")
                        ultimo_aviso = agora

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
                    enviar_para_sistema(placa, conf_ocr, imagem_para_base64(recorte),
                                        camera_id)

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

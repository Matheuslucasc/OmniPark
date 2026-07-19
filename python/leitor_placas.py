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
import threading
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
# Roteia a câmera ATIVA do site pelo proxy MediaMTX. Necessário para câmeras que
# não abrem direto no OpenCV (RTSP fora do padrão). Requer o MediaMTX rodando
# com "api: yes" (o iniciar_leitor.bat já sobe). Assim, trocar a câmera no site
# troca a câmera de leitura automaticamente, sem editar arquivos no PC.
USAR_PROXY      = os.getenv("USAR_PROXY", "false").lower() == "true"
# De onde o leitor lê quando usa o proxy, e a API do MediaMTX para reconfigurá-lo.
PROXY_URL       = os.getenv("PROXY_URL",   "rtsp://127.0.0.1:8554/cam")
MEDIAMTX_API    = os.getenv("MEDIAMTX_API", "http://127.0.0.1:9997")
# Transporte que o MediaMTX usa para LER a câmera. As câmeras genéricas fora do
# padrão pedem "udp"; "automatic" tenta udp e depois tcp; "tcp" força TCP.
PROXY_TRANSPORT = os.getenv("PROXY_TRANSPORT", "udp")
# Nome do path no MediaMTX (derivado da PROXY_URL: .../cam -> "cam").
PROXY_PATH      = PROXY_URL.rstrip("/").rsplit("/", 1)[-1]
YOLO_MODEL    = os.getenv("YOLO_MODEL",          str(Path(__file__).parent / "license_plate_detector.pt"))
CONFIANCA_MIN = float(os.getenv("CONFIANCA_MIN", "0.35"))  # confiança mínima do YOLO
# Tamanho de entrada do YOLO. Menor = mais rápido e fluido, com leve perda de
# alcance em placas distantes. 640 = padrão do modelo; 512 = bom equilíbrio.
IMGSZ         = int(os.getenv("IMGSZ",           "512"))
CONF_OCR_MIN  = float(os.getenv("CONF_OCR_MIN",  "0.80"))  # confiança mínima do OCR
VOTOS_MIN     = int(os.getenv("VOTOS_MIN",       "4"))     # leituras iguais p/ confirmar
COOLDOWN_S    = float(os.getenv("COOLDOWN_S",    "30"))    # seg. fora da imagem p/ liberar
PULAR_FRAMES  = int(os.getenv("PULAR_FRAMES",    "1"))     # processa 1 a cada N frames
                                                           # (1 = todos; a captura em
                                                           # thread já descarta os atrasados)
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


def configurar_proxy(url: str) -> bool:
    """Aponta o proxy MediaMTX para a URL da câmera (via API), para o leitor
    poder ler QUALQUER câmera pelo localhost. Retorna True se deu certo."""
    endpoint = f"{MEDIAMTX_API}/v3/config/paths/patch/{PROXY_PATH}"
    payload = {"source": url, "rtspTransport": PROXY_TRANSPORT, "sourceOnDemand": False}
    try:
        r = requests.patch(endpoint, json=payload, timeout=5)
        if r.status_code == 200:
            print(f"  Proxy apontado para a câmera ({PROXY_TRANSPORT}).")
            return True
        print(f"  ✗ MediaMTX API {r.status_code}: {r.text[:150]}")
    except requests.exceptions.RequestException:
        print(f"  ✗ Sem conexão com o MediaMTX ({MEDIAMTX_API}). Ele está rodando?")
    return False


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


class CameraStream:
    """Captura a câmera em uma thread e mantém só o frame MAIS RECENTE,
    descartando os atrasados.

    Sem isto, o loop de processamento (YOLO ~230ms/frame no CPU) é mais lento
    que a câmera (15 fps) e os frames se acumulam no buffer — a imagem exibida
    vai ficando cada vez mais atrasada. Com a captura em thread, o YOLO sempre
    pega o frame atual e a latência para de crescer.

    Delega get/set/isOpened/release para o VideoCapture, então é um substituto
    direto dele nos trechos de câmera ao vivo.
    """

    def __init__(self, cap: "cv2.VideoCapture"):
        self._cap = cap
        self._lock = threading.Lock()
        self._frame = None
        self._novo = False
        self._seq = 0
        self._rodando = True
        self._t = threading.Thread(target=self._loop, daemon=True, name="captura")
        self._t.start()

    def _loop(self):
        while self._rodando:
            ok, fr = self._cap.read()
            if not ok:
                self._rodando = False
                break
            with self._lock:
                self._frame = fr
                self._novo = True
                self._seq += 1

    def snapshot(self):
        """Retorna (seq, frame) do frame mais recente SEM consumi-lo. Vários
        leitores (worker de detecção e loop de exibição) podem chamar em paralelo;
        `seq` muda a cada novo frame, para o worker não reprocessar o mesmo."""
        with self._lock:
            return self._seq, self._frame

    def read(self):
        # Espera o próximo frame novo (até ~5s). Retorna sempre o mais recente;
        # os frames capturados nesse meio-tempo são descartados de propósito.
        for _ in range(1000):
            with self._lock:
                if self._novo:
                    self._novo = False
                    return True, self._frame
            if not self._rodando:
                return False, None
            time.sleep(0.005)
        return False, None

    def isOpened(self):
        return self._rodando and self._cap.isOpened()

    def get(self, prop):
        return self._cap.get(prop)

    def set(self, prop, val):
        return self._cap.set(prop, val)

    def release(self):
        self._rodando = False
        self._t.join(timeout=1.0)
        self._cap.release()


def abrir_camera(url: str):
    src = int(url) if url.isdigit() else url
    if isinstance(src, str) and src.lower().startswith("rtsp"):
        # Força RTSP por TCP (evita frames corrompidos/travas) e usa o backend
        # FFMPEG explicitamente. Precisa ser setado ANTES de abrir o stream.
        # Câmeras IP fora do padrão devem ser lidas via o proxy MediaMTX
        # (rtsp://127.0.0.1:8554/cam) — ver mediamtx/omni.yml.
        # fflags/nobuffer + low_delay + reorder_queue_size=0: reduzem o buffer
        # do ffmpeg para o vídeo chegar o mais próximo possível do tempo real.
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
            "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|reorder_queue_size;0")
        cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
    else:
        cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise RuntimeError(f"Não abriu a câmera: {url}")
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    # Evita travar para sempre se a câmera cair (ex.: DroidCam vai a segundo
    # plano): a leitura falha em vez de bloquear, e o leitor reconecta.
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 8000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 6000)
    return cap


class CtxDeteccao:
    """Estado da votação/anti-duplicação, mantido entre os frames."""

    def __init__(self):
        self.votos: Counter[str] = Counter()
        self.ultimo_voto = 0.0
        self.ultimo_aviso = 0.0
        self.bloqueadas: dict[str, float] = {}  # placa enviada -> última vez vista


def _desenhar(frame, desenhos):
    """Desenha as caixas/rótulos (x1,y1,x2,y2,cor,rotulo) sobre o frame."""
    for x1, y1, x2, y2, cor, rotulo in desenhos:
        cv2.rectangle(frame, (x1, y1), (x2, y2), cor, 2)
        cv2.putText(frame, rotulo, (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, cor, 2)


def processar_deteccoes(frame, model, ocr, camera_id, ctx: CtxDeteccao):
    """Roda YOLO+OCR no frame, aplica votação/anti-duplicação e envia as placas
    confirmadas. Retorna as caixas a desenhar: (x1,y1,x2,y2,cor,rotulo)."""
    agora = time.time()
    # Sem leitura há 2s: zera a votação (o carro já passou).
    if ctx.votos and agora - ctx.ultimo_voto > 2.0:
        ctx.votos.clear()

    desenhos = []
    resultados = model(frame, conf=CONFIANCA_MIN, imgsz=IMGSZ, verbose=False)
    for box in resultados[0].boxes:
        recorte = recortar_placa(frame, box)

        # Placa detectada mas pequena: avisa (no máximo a cada 3s) para o
        # operador aproximar a câmera.
        larg = recorte.shape[1] if recorte.size else 0
        if 0 < larg < MIN_LARGURA and agora - ctx.ultimo_aviso > 3.0:
            print(f"  placa detectada, porém pequena ({larg}px < {MIN_LARGURA}px) "
                  "— aproxime a câmera para ler com segurança")
            ctx.ultimo_aviso = agora

        placa, conf_ocr = ler_placa(ocr, recorte)

        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cor = (0, 200, 0) if placa else (0, 165, 255)
        rotulo = f"{formatar(placa)} {conf_ocr:.0%}" if placa else "placa"
        desenhos.append((x1, y1, x2, y2, cor, rotulo))

        if not placa or conf_ocr < CONF_OCR_MIN:
            continue

        # Anti-duplicação: placa já enviada fica bloqueada enquanto o carro
        # estiver na frente da câmera (mesmo parado).
        if placa in ctx.bloqueadas:
            if agora - ctx.bloqueadas[placa] < COOLDOWN_S:
                ctx.bloqueadas[placa] = agora  # ainda vendo: renova
                continue
            del ctx.bloqueadas[placa]  # sumiu tempo suficiente: libera

        ctx.votos[placa] += 1
        ctx.ultimo_voto = agora
        if ctx.votos[placa] < VOTOS_MIN:
            continue

        # Placa confirmada pela votação: envia.
        ctx.votos.clear()
        ctx.bloqueadas[placa] = agora
        print(f"\n[CONFIRMADA] {formatar(placa)} conf={conf_ocr:.0%}")
        enviar_para_sistema(placa, conf_ocr, imagem_para_base64(recorte), camera_id)

    return desenhos


def _loop_arquivo(cap, model, ocr, camera_id, ctx, fps) -> bool:
    """Vídeo de arquivo (teste): processa os frames na velocidade real.
    Retorna True se o usuário apertou Q."""
    n_frame = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # recomeça o vídeo
            continue
        n_frame += 1
        if n_frame % PULAR_FRAMES == 0:
            desenhos = processar_deteccoes(frame, model, ocr, camera_id, ctx)
            if MOSTRAR_VIDEO:
                _desenhar(frame, desenhos)
        if MOSTRAR_VIDEO:
            cv2.imshow("OmniPark — Câmera (Q para sair)", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                cv2.destroyAllWindows()
                return True
        time.sleep(1 / fps)  # simula a velocidade real da câmera
    return False


def _loop_ao_vivo(cap, model, ocr, camera_id, ctx, fonte_site) -> bool:
    """Câmera ao vivo: a DETECÇÃO roda num worker (no ritmo do YOLO) e a EXIBIÇÃO
    roda no loop principal em ~tempo real, mostrando o frame mais novo com as
    últimas caixas. Assim o vídeo fica fluido mesmo com o YOLO lento no CPU.
    `fonte_site` é a URL real da câmera ativa (para detectar troca no site).
    Retorna True se o usuário apertou Q."""
    estado = {"desenhos": [], "lock": threading.Lock(), "rodar": True}

    def worker():
        ultimo_seq = -1
        while estado["rodar"] and cap.isOpened():
            seq, frame = cap.snapshot()
            if frame is None or seq == ultimo_seq:
                time.sleep(0.005)  # nada novo ainda
                continue
            ultimo_seq = seq
            desenhos = processar_deteccoes(frame, model, ocr, camera_id, ctx)
            with estado["lock"]:
                estado["desenhos"] = desenhos

    t = threading.Thread(target=worker, daemon=True, name="deteccao")
    t.start()

    ultima_checagem = time.time()
    sair = False
    try:
        while cap.isOpened():
            # Verifica periodicamente se a câmera ativa mudou no site.
            if not CAMERA_URL and time.time() - ultima_checagem > CHECAR_CAMERA_S:
                ultima_checagem = time.time()
                atual = obter_camera_ativa()
                if atual and atual[0] != fonte_site:
                    print(f"\nCâmera ativa trocada no site → {atual[2]}. Reconectando...\n")
                    break

            seq, frame = cap.snapshot()
            if frame is None:
                time.sleep(0.01)
                continue

            if MOSTRAR_VIDEO:
                vis = frame.copy()
                with estado["lock"]:
                    desenhos = list(estado["desenhos"])
                _desenhar(vis, desenhos)
                cv2.imshow("OmniPark — Câmera (Q para sair)", vis)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    sair = True
                    break
            else:
                time.sleep(0.03)  # sem janela: só mantém o worker vivo
    finally:
        estado["rodar"] = False
        t.join(timeout=1.0)
        if sair:
            cv2.destroyAllWindows()
    return sair


def main():
    print("=" * 55)
    print("  OmniPark — Leitor de Placas")
    print("=" * 55)
    print(f"  API    : {API_URL}")
    print(f"  Câmera : {CAMERA_URL or 'câmera ativa do site (via API)'}")
    print(f"  Modelo : {YOLO_MODEL}  (imgsz={IMGSZ})")
    print("=" * 55)

    # Deixa ~2 núcleos livres para a decodificação/exibição do vídeo — assim o
    # YOLO não monopoliza a CPU e a imagem não trava durante a inferência.
    try:
        import torch
        torch.set_num_threads(max(2, (os.cpu_count() or 4) - 2))
    except Exception:
        pass

    model = YOLO(YOLO_MODEL)
    print("  Modelo YOLO carregado.")
    ocr = carregar_ocr()
    print("  Modelo de OCR carregado.\n")

    while True:
        # fonte_site = URL/valor decidido (fixo do .env ou câmera ativa do site).
        fonte_site, camera_id, nome = resolver_fonte()

        # Modo proxy: aponta o MediaMTX para a câmera do site e lê do localhost.
        # Assim o site controla a câmera e o proxy trata qualquer RTSP. Só o RTSP
        # passa pelo proxy — HTTP/MJPEG (ex.: DroidCam), webcam e vídeo o OpenCV
        # abre direto (o MediaMTX não lê MJPEG-over-HTTP).
        if USAR_PROXY and fonte_site.lower().startswith("rtsp") \
                and fonte_site != PROXY_URL:
            if not configurar_proxy(fonte_site):
                print("  Não consegui configurar o proxy. Tentando em 5s...\n")
                time.sleep(5)
                continue
            fonte_leitura = PROXY_URL
        else:
            fonte_leitura = fonte_site

        # Vídeo de arquivo (teste) roda em loop na velocidade real.
        eh_arquivo = not fonte_leitura.isdigit() and \
            not fonte_leitura.lower().startswith(("rtsp", "http"))
        try:
            cap = abrir_camera(fonte_leitura)
            # Câmera ao vivo: captura em thread mantendo só o frame mais novo
            # (baixa latência). Vídeo de arquivo: leitura direta (velocidade real).
            if not eh_arquivo:
                cap = CameraStream(cap)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            print(f"Câmera conectada: {nome} ({fonte_site})\n")
        except RuntimeError as e:
            print(f"Erro: {e}. Tentando em 5s...")
            time.sleep(5)
            continue

        ctx = CtxDeteccao()
        if eh_arquivo:
            sair = _loop_arquivo(cap, model, ocr, camera_id, ctx, fps)
        else:
            sair = _loop_ao_vivo(cap, model, ocr, camera_id, ctx, fonte_site)
        cap.release()
        if sair:
            return
        time.sleep(2)


if __name__ == "__main__":
    main()

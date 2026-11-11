"""Servidor local que simula os endpoints do Vercel para testar o leitor sem
depender do deploy:
  GET  /api/active-camera  -> devolve uma câmera ativa (por padrão, o vídeo de teste)
  POST /api/plate-read     -> imprime a placa recebida

Uso:
  TESTE_STREAM=c:/caminho/video.mp4 python teste_api_local.py
"""
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

STREAM = os.getenv("TESTE_STREAM", "c:/Workspace/BackendOmni/VideoCorsa.mp4")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/active-camera"):
            self._responder({"id": 1, "name": "Câmera de Teste", "location": "Entrada",
                             "stream_url": STREAM})
        else:
            self._responder(None, 404)

    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        tem_foto = bool(corpo.get("image_base64"))
        print(f"RECEBIDO: plate={corpo.get('plate')} confidence={corpo.get('confidence')} "
              f"camera_id={corpo.get('camera_id')} foto={'sim' if tem_foto else 'nao'}",
              flush=True)
        self._responder({"success": True, "id": 1, "plate": corpo.get("plate"),
                         "image_url": "https://exemplo/foto.jpg" if tem_foto else None})

    def _responder(self, corpo, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(corpo).encode())

    def log_message(self, *args):
        pass


print(f"Mock ouvindo em http://127.0.0.1:9999  (stream: {STREAM})", flush=True)
HTTPServer(("127.0.0.1", 9999), Handler).serve_forever()

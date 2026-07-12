"""Receptor local que simula o /api/plate-read do Vercel (apenas para teste)."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        tem_foto = bool(corpo.get("image_base64"))
        print(f"RECEBIDO: plate={corpo.get('plate')} confidence={corpo.get('confidence')} "
              f"camera_id={corpo.get('camera_id')} foto={'sim' if tem_foto else 'nao'} "
              f"auth={self.headers.get('Authorization')}", flush=True)
        resposta = json.dumps({"success": True, "id": 1, "plate": corpo.get("plate"),
                               "image_url": "https://exemplo/foto.jpg" if tem_foto else None})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(resposta.encode())

    def log_message(self, *args):
        pass


HTTPServer(("127.0.0.1", 9999), Handler).serve_forever()

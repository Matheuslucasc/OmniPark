# Instalação do leitor de placas no computador do cliente

Como o sistema funciona em produção:

```text
Câmera do estacionamento
   └─> Leitor (esta pasta, roda no PC do cliente)
        └─> envia placa + foto para o site no Vercel (/api/plate-read)
             └─> Supabase guarda a leitura e a foto
                  └─> o site mostra em tempo real, em qualquer computador
```

O site fica no Vercel e os dados no Supabase — **no computador do cliente só
roda este leitor**. Não precisa de executável nem servidor local: o leitor é
um script Python instalado pelo `instalar.bat`.

## Passo a passo no computador do cliente

1. **Instalar o Python 3.11** (uma vez só): baixe em
   <https://www.python.org/downloads/> e marque **"Add python.exe to PATH"**
   na instalação.

2. **Copiar esta pasta `python`** para o computador (pendrive ou download do
   GitHub). O modelo `license_plate_detector.pt` já vem dentro.

3. **Rodar `instalar.bat`** (duplo clique). Baixa as dependências (~2 GB) e o
   modelo de OCR. Precisa de internet nesta etapa.

4. **Editar o arquivo `.env`** (Bloco de Notas):
   - `OMNIPARK_API_URL` → endereço do site, ex.: `https://omnipark.vercel.app/api/plate-read`
   - `OMNIPARK_API_SECRET` → a mesma chave configurada como `PLATE_API_SECRET` no Vercel
   - `CAMERA_URL` → a câmera:
     - Intelbras/Dahua: `rtsp://usuario:senha@IP:554/cam/realmonitor?channel=1&subtype=0`
     - Hikvision: `rtsp://usuario:senha@IP:554/Streaming/Channels/101`
     - Webcam USB: `0`
     - Vídeo gravado (teste): `C:\caminho\video.mp4`

5. **Rodar `iniciar_leitor.bat`**. A janela mostra as leituras
   (`[CONFIRMADA] ABC-1234`) e o site preenche a placa sozinho.

## Iniciar junto com o Windows (recomendado)

1. Aperte `Win + R`, digite `shell:startup`, Enter.
2. Cole nessa pasta um **atalho** para o `iniciar_leitor.bat`.

Dica: com `MOSTRAR_VIDEO=false` no `.env`, o leitor roda sem abrir a janela
de vídeo (gasta menos e não atrapalha o operador).

## Qualidade da leitura (como o leitor decide)

- **Votação**: a placa só é enviada após 3 leituras iguais seguidas — um
  frame borrado não gera placa errada.
- **Anti-duplicação**: depois de enviada, a mesma placa fica bloqueada
  enquanto o carro estiver na frente da câmera (mesmo parado no portão);
  só libera 30 segundos depois de sair da imagem.
- **Validação**: só envia placas válidas nos formatos ABC1234 (antigo) e
  ABC1D23 (Mercosul), com correção de confusões comuns do OCR (O↔0, I↔1...).

## Problemas comuns

- **"Sem conexão com https://..."** — confira a `OMNIPARK_API_URL` e a
  internet do computador.
- **"Erro API 401"** — a `OMNIPARK_API_SECRET` do `.env` não bate com a
  `PLATE_API_SECRET` do Vercel.
- **"Não abriu a câmera"** — teste a URL RTSP no VLC (Mídia → Abrir
  transmissão de rede); confira usuário/senha e se a câmera está na rede.
- **Leitura ruim à noite** — ilumine a entrada ou use câmera com IR; a câmera
  deve ver a placa de frente.

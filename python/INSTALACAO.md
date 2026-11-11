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

3. **Rodar `instalar.bat`** (duplo clique). Baixa as dependências (~2 GB), o
   modelo de OCR e o proxy de câmera (MediaMTX), e cria os arquivos `.env` e
   `mediamtx\omni.yml`. Precisa de internet nesta etapa.

4. **Editar o arquivo `.env`** (Bloco de Notas):
   - `OMNIPARK_API_URL` → endereço do site, ex.: `https://omnipark.vercel.app/api/plate-read`
   - `OMNIPARK_API_SECRET` → a mesma chave configurada como `PLATE_API_SECRET` no Vercel
   - `CAMERA_URL` → **deixe vazio** para usar a câmera cadastrada no site (recomendado).
     Só preencha para forçar uma fonte fixa (ex.: `0` para webcam, um caminho de
     vídeo para teste, ou `rtsp://127.0.0.1:8554/cam` se usar o proxy — passo 5).

5. **Escolher a câmera** (um dos dois casos):

   **a) Câmera comum** (abre direto): cadastre pelo site → aba **Câmeras** →
   **Adicionar** → IP, porta, usuário e senha → deixe-a **ativa**. O leitor a
   busca sozinho; para trocar depois, basta marcar outra como ativa no site
   (**sem mexer no computador**). Deixe `CAMERA_URL` vazio no `.env`.

   Campos típicos por fabricante:
   - Intelbras/Dahua: protocolo `rtsp`, porta `554`, caminho `/cam/realmonitor?channel=1&subtype=0`
   - Hikvision: protocolo `rtsp`, porta `554`, caminho `/Streaming/Channels/101`

   **b) Câmera que não abre direto** (abre no VLC mas dá erro no leitor, comum em
   câmeras ONVIF genéricas): cadastre a câmera no site normalmente e ligue o
   **proxy MediaMTX** deixando `CAMERA_URL` vazio e `USAR_PROXY=true` no `.env`.
   O leitor pega a câmera ativa do site, aponta o proxy pra ela e lê pelo
   localhost — e **trocar a câmera no site continua funcionando** (o proxy segue
   a câmera ativa). Ver a seção *"Câmera que não abre direto"* abaixo.

6. **Rodar `iniciar_leitor.bat`**. A janela mostra as leituras
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
- **"Nenhuma câmera ativa no site ainda"** — cadastre e ative uma câmera na
  aba Câmeras do site (passo 5), ou preencha `CAMERA_URL` no `.env`.
- **"Não abriu a câmera"** — teste a URL RTSP no VLC (Mídia → Abrir
  transmissão de rede); confira usuário/senha e se a câmera está na rede.
  Se abre no VLC mas **não** no leitor (erro tipo *"Nonmatching transport"*),
  a câmera fala RTSP fora do padrão — use o **proxy MediaMTX** (abaixo).
- **Erro ao salvar câmera no site** — se aparecer erro de permissão, rode no
  SQL Editor do Supabase: `ALTER TABLE camera_settings DISABLE ROW LEVEL SECURITY;`
- **Placa lê no leitor mas NÃO aparece no site** — falta o Realtime/RLS da
  tabela `plate_reads`. O leitor envia e o banco grava, mas o Supabase só avisa
  o site em tempo real se a `plate_reads` tiver RLS habilitado COM policy de
  SELECT (o Realtime usa o RLS para autorizar a entrega). Rode no SQL Editor o
  bloco `plate_reads` do `schema.sql` (RLS + policies de SELECT e INSERT).
- **Leitura ruim à noite** — ilumine a entrada ou use câmera com IR; a câmera
  deve ver a placa de frente.

## Câmera que não abre direto (proxy MediaMTX)

Algumas câmeras IP baratas falam RTSP de forma não-padrão: abrem no VLC, mas o
OpenCV/ffmpeg do leitor recusa. A solução é o **MediaMTX**, um proxy que puxa da
câmera e republica um stream limpo em `rtsp://127.0.0.1:8554/cam`. O
`instalar.bat` já baixa o MediaMTX e cria o `mediamtx\omni.yml`.

**Recomendado — o site continua controlando a câmera:**

1. Cadastre a câmera na aba **Câmeras** do site (IP/porta/usuário/senha) e
   deixe-a **ativa**, como qualquer câmera.
2. No `.env`, deixe `CAMERA_URL` **vazio** e ponha `USAR_PROXY=true`.
3. Rode `iniciar_leitor.bat`. O leitor pega a câmera ativa do site, aponta o
   proxy pra ela automaticamente e lê pelo localhost. Trocar a câmera no site
   troca a leitura sozinho (em ~15s), **sem mexer no PC**.

Se a câmera não conectar, ajuste `PROXY_TRANSPORT` no `.env` entre `udp`
(padrão, funciona nessas câmeras genéricas), `automatic` ou `tcp`.

**Alternativa — câmera fixa, sem depender do site:** deixe `USAR_PROXY=false`,
ponha a URL real da câmera no `source:` do `mediamtx\omni.yml` e
`CAMERA_URL=rtsp://127.0.0.1:8554/cam` no `.env`.

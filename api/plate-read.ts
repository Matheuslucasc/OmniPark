/**
 * POST /api/plate-read
 *
 * Recebe a leitura de placa do script Python.
 * - Faz upload da foto para Supabase Storage (bucket: plate-images)
 * - Grava o registro em plate_reads com a URL da imagem
 * - O frontend recebe via Supabase Realtime e exibe automaticamente
 *
 * Body JSON esperado:
 *   {
 *     plate:        "ABC1D23",    // texto da placa (obrigatório)
 *     confidence:   0.92,         // confiança do modelo (0-1)
 *     camera_id:    1,            // id da câmera (opcional)
 *     image_base64: "..."         // foto da placa em base64 JPEG (opcional)
 *   }
 *
 * Header (quando PLATE_API_SECRET está configurado no Vercel):
 *   Authorization: Bearer <PLATE_API_SECRET>
 */
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function uploadImagem(
  supabaseUrl: string,
  supabaseKey: string,
  plate: string,
  base64: string,
): Promise<string | null> {
  try {
    // Decodifica base64 → bytes
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const filename = `${Date.now()}-${plate}.jpg`;

    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/plate-images/${filename}`,
      {
        method: 'POST',
        headers: {
          apikey:        supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'image/jpeg',
        },
        body: bytes,
      }
    );

    if (!res.ok) {
      console.warn('[plate-read] Upload falhou:', await res.text());
      return null;
    }

    return `${supabaseUrl}/storage/v1/object/public/plate-images/${filename}`;
  } catch (e) {
    console.error('[plate-read] Erro no upload:', e);
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')   return new Response('Method Not Allowed', { status: 405 });

  // ── Autenticação ──────────────────────────────────────────────────────────
  const secret = process.env.PLATE_API_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { plate?: string; confidence?: number; camera_id?: number; image_base64?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  // Fluxo "foto + digitação manual": a câmera pode enviar só a foto, sem texto
  // de placa. O operador digita a placa no dashboard. Por isso aceitamos uma
  // leitura quando houver uma placa válida (>= 6) OU uma foto.
  const rawPlate = (body.plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const plate = rawPlate.length >= 6 ? rawPlate : '';
  if (!plate && !body.image_base64) {
    return json({ error: 'Envie uma placa válida (>= 6 caracteres) ou uma foto' }, 400);
  }

  // ── Configuração Supabase ─────────────────────────────────────────────────
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase não configurado' }, 500);

  // ── Upload da imagem (se enviada) ─────────────────────────────────────────
  let imageUrl: string | null = null;
  if (body.image_base64) {
    imageUrl = await uploadImagem(supabaseUrl, supabaseKey, plate || 'sem-placa', body.image_base64);
  }

  // ── Grava em plate_reads ──────────────────────────────────────────────────
  const res = await fetch(`${supabaseUrl}/rest/v1/plate_reads`, {
    method: 'POST',
    headers: {
      apikey:        supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer:        'return=representation',
    },
    body: JSON.stringify({
      plate,
      confidence: body.confidence ?? null,
      camera_id:  body.camera_id  ?? null,
      image_url:  imageUrl,
      processed:  false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[plate-read] Erro Supabase:', err);
    return json({ error: err }, 500);
  }

  const [row] = await res.json();
  return json({ success: true, id: row?.id, plate, image_url: imageUrl });
}

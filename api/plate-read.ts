/**
 * POST /api/plate-read
 *
 * Recebe a leitura de placa do script Python e grava no Supabase.
 * O frontend escuta a tabela plate_reads via Supabase Realtime e
 * exibe a placa no dashboard em tempo real.
 *
 * Body esperado:
 *   { plate: "ABC1D23", confidence: 0.92, camera_id: 1 }
 *
 * Header obrigatório (quando PLATE_API_SECRET está configurado):
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // ── Autenticação por chave secreta (opcional mas recomendado) ─────────────
  const secret = process.env.PLATE_API_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
  }

  // ── Parse do body ─────────────────────────────────────────────────────────
  let body: { plate?: string; confidence?: number; camera_id?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const plate = (body.plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (plate.length < 6) return json({ error: 'Placa inválida (mínimo 6 caracteres)' }, 400);

  // ── Configuração Supabase ─────────────────────────────────────────────────
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase não configurado' }, 500);

  // ── Grava em plate_reads ──────────────────────────────────────────────────
  const res = await fetch(`${supabaseUrl}/rest/v1/plate_reads`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      plate,
      confidence: body.confidence ?? null,
      camera_id:  body.camera_id  ?? null,
      processed:  false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[plate-read] Supabase error:', err);
    return json({ error: err }, 500);
  }

  const [row] = await res.json();
  return json({ success: true, id: row?.id, plate });
}

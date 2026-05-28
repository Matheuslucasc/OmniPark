/**
 * GET /api/latest-plate
 *
 * Retorna a última placa lida (usada como fallback de polling).
 * O método principal é Supabase Realtime — este endpoint é backup.
 */
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response('Supabase não configurado', { status: 500 });
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/plate_reads?select=*&order=read_at.desc&limit=1`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );

  const data = await res.json();
  return new Response(JSON.stringify(data[0] ?? null), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

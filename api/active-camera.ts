/**
 * GET /api/active-camera
 *
 * Retorna a câmera marcada como ativa na aba Câmeras do site, já com a URL de
 * stream montada. O leitor de placas em Python consulta este endpoint para
 * saber de qual câmera deve capturar — trocar a câmera ativa no site troca a
 * fonte do leitor sem precisar mexer no computador do estacionamento.
 *
 * Resposta:
 *   { id, name, location, stream_url }   ou   null (nenhuma ativa)
 *
 * Header (quando PLATE_API_SECRET está configurado no Vercel):
 *   Authorization: Bearer <PLATE_API_SECRET>
 */
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface CameraRow {
  id: number;
  name: string;
  ip_address: string;
  port: number;
  protocol: string;
  stream_path: string | null;
  username: string | null;
  password: string | null;
  location: string | null;
}

function buildStreamUrl(cam: CameraRow): string {
  const auth = cam.username
    ? `${cam.username}${cam.password ? `:${cam.password}` : ''}@`
    : '';
  const path = cam.stream_path
    ? (cam.stream_path.startsWith('/') ? cam.stream_path : `/${cam.stream_path}`)
    : '';
  return `${cam.protocol}://${auth}${cam.ip_address}:${cam.port}${path}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Autenticação (mesma chave do envio de placas)
  const secret = process.env.PLATE_API_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response('Supabase não configurado', { status: 500, headers: CORS });
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/camera_settings?select=*&is_active=eq.true&limit=1`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );

  if (!res.ok) {
    return new Response(await res.text(), { status: 500, headers: CORS });
  }

  const rows: CameraRow[] = await res.json();
  const cam = rows[0];
  const corpo = cam
    ? {
        id: cam.id,
        name: cam.name,
        location: cam.location,
        stream_url: buildStreamUrl(cam),
      }
    : null;

  return new Response(JSON.stringify(corpo), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

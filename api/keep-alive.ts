/**
 * GET /api/keep-alive
 *
 * Ping periódico no banco Supabase para evitar que o projeto seja pausado
 * por inatividade (plano gratuito pausa após ~7 dias sem atividade).
 *
 * Executado automaticamente pelo Vercel Cron a cada 3 dias (ver vercel.json).
 * Faz uma consulta real no Postgres (via PostgREST) para contar como atividade.
 *
 * Segurança: se a variável CRON_SECRET estiver configurada no Vercel, o próprio
 * Vercel envia "Authorization: Bearer <CRON_SECRET>" e chamadas sem ela são recusadas.
 */
export const config = { runtime: 'edge' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY; // chave de servidor (nunca vai para o navegador) ou, na falta dela, a anon
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Supabase não configurado' }, 500);

  const startedAt = Date.now();
  const res = await fetch(`${supabaseUrl}/rest/v1/parking_settings?select=id&limit=1`, {
    headers: {
      apikey:        supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[keep-alive] Erro Supabase:', res.status, err);
    return json({ ok: false, status: res.status, error: err }, 502);
  }

  await res.json();
  const ms = Date.now() - startedAt;
  console.log(`[keep-alive] Supabase respondeu em ${ms}ms`);
  return json({ ok: true, at: new Date().toISOString(), latency_ms: ms });
}

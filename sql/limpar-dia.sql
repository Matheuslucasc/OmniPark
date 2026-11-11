-- ============================================================
-- OmniPark — Limpar os registros de UM dia
-- Uso no SQL Editor do Supabase.
--
-- PASSO 0 (só na primeira vez): rode o bloco "CRIAR A FUNÇÃO" abaixo.
--
-- PASSO 1 — CONFERIR (não apaga nada; troque só a data):
--   select * from limpar_dia('2026-11-11');
--
-- PASSO 2 — APAGAR (mesma data + true no final):
--   select * from limpar_dia('2026-11-11', true);
--
-- O que é apagado: todo veículo que ENTROU ou SAIU no dia (horário de
-- Brasília) e o contador de tickets desse dia (o próximo volta a ser 001).
-- Configurações, tarifas, câmeras e usuários NÃO são afetados.
-- Apagar não tem volta: se quiser guardar, exporte antes em
-- Relatórios → Exportar CSV.
-- Depois de apagar, recarregue os aparelhos (Ctrl+F5).
-- ============================================================


-- ── CRIAR A FUNÇÃO (rodar uma vez; pode rodar de novo sem problema) ──────────
CREATE OR REPLACE FUNCTION public.limpar_dia(p_dia DATE, p_confirmar BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  numero   INTEGER,
  placa    VARCHAR,
  situacao VARCHAR,
  entrada  TIMESTAMP,
  saida    TIMESTAMP,
  valor    NUMERIC,
  acao     TEXT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ini TIMESTAMPTZ;
  v_fim TIMESTAMPTZ;
BEGIN
  IF p_dia IS NULL THEN
    RAISE EXCEPTION 'Informe o dia, ex.: select * from limpar_dia(''2026-11-11'');';
  END IF;

  v_ini := p_dia::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_fim := v_ini + INTERVAL '1 day';

  -- Lista o que será (ou foi) apagado
  RETURN QUERY
    SELECT v.daily_ticket,
           v.plate,
           v.status,
           v.entry_time AT TIME ZONE 'America/Sao_Paulo',
           v.exit_time  AT TIME ZONE 'America/Sao_Paulo',
           v.amount_paid,
           CASE WHEN p_confirmar THEN 'APAGADO' ELSE 'será apagado (rode de novo com true)' END
    FROM vehicles v
    WHERE (v.entry_time >= v_ini AND v.entry_time < v_fim)
       OR (v.exit_time  >= v_ini AND v.exit_time  < v_fim)
    ORDER BY v.entry_time;

  IF p_confirmar THEN
    DELETE FROM vehicles v
     WHERE (v.entry_time >= v_ini AND v.entry_time < v_fim)
        OR (v.exit_time  >= v_ini AND v.exit_time  < v_fim);

    DELETE FROM daily_ticket_counters c WHERE c.dia = p_dia;
  END IF;
END;
$$;

-- Segurança: só quem está no SQL Editor (dono do banco) pode usar.
-- O site e a API NÃO conseguem chamar esta função.
REVOKE ALL ON FUNCTION public.limpar_dia(DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;


-- ── EXEMPLOS (troque a data) ────────────────────────────────────────────────
-- select * from limpar_dia('2026-11-11');          -- só confere
-- select * from limpar_dia('2026-11-11', true);    -- apaga


-- ── ZERAR TUDO (todas as datas) — use só para começar a produção do zero ────
-- truncate vehicles, daily_ticket_counters;
-- truncate plate_reads, plate_corrections restart identity;  -- opcional: leituras da câmera

-- ============================================================
-- OmniPark — Conferência da numeração dos tickets
-- Rode cada consulta no SQL Editor do Supabase (são só leitura).
-- O "dia" segue o horário de Brasília, igual ao contador do banco.
-- ============================================================

-- 1) RESUMO POR DIA (últimos 60 dias)
--    Tudo certo quando: sem_numero = 0, repetidos = 0 e numeros_pulados = 0.
--    Pulos podem ser normais (ticket excluído no Histórico).
WITH v AS (
  SELECT (entry_time AT TIME ZONE 'America/Sao_Paulo')::date AS dia, daily_ticket
  FROM vehicles
)
SELECT dia,
       COUNT(*)                                   AS entradas,
       COUNT(*) - COUNT(daily_ticket)             AS sem_numero,
       MIN(daily_ticket)                          AS primeiro,
       MAX(daily_ticket)                          AS ultimo,
       COUNT(daily_ticket) - COUNT(DISTINCT daily_ticket) AS repetidos,
       COALESCE(MAX(daily_ticket), 0) - COUNT(DISTINCT daily_ticket) AS numeros_pulados
FROM v
GROUP BY dia
ORDER BY dia DESC
LIMIT 60;

-- 2) DETALHE DOS NÚMEROS REPETIDOS (mesmo nº no mesmo dia)
SELECT (entry_time AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
       daily_ticket                                         AS numero,
       COUNT(*)                                             AS vezes,
       string_agg(plate || ' ' || to_char(entry_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
                  || ' (' || status || ')', ' | ' ORDER BY entry_time) AS veiculos
FROM vehicles
WHERE daily_ticket IS NOT NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY 1 DESC, 2;

-- 3) NÚMEROS PULADOS EM UM DIA (troque a data)
WITH d AS (SELECT DATE '2026-11-10' AS dia),
     nums AS (
       SELECT daily_ticket FROM vehicles, d
       WHERE (entry_time AT TIME ZONE 'America/Sao_Paulo')::date = d.dia
         AND daily_ticket IS NOT NULL
     )
SELECT g AS numero_que_falta
FROM generate_series(1, (SELECT COALESCE(MAX(daily_ticket), 0) FROM nums)) AS g
WHERE g NOT IN (SELECT daily_ticket FROM nums)
ORDER BY g;

-- 4) PLACAS COM MAIS DE UM BILHETE ATIVO (não deveria existir)
--    Para resolver: dê saída (ou exclua) o registro errado pelo sistema.
SELECT plate, COUNT(*) AS bilhetes_ativos,
       string_agg(COALESCE(daily_ticket::text, '?') || ' às '
                  || to_char(entry_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'), ' | ' ORDER BY entry_time) AS tickets
FROM vehicles
WHERE status = 'parked'
GROUP BY plate
HAVING COUNT(*) > 1;

-- 5) NUMERAÇÃO FORA DE ORDEM (nº menor ou igual ao da entrada anterior do dia)
--    Sinal de dois aparelhos numerando ao mesmo tempo ou relógio errado.
SELECT dia, entry_time AT TIME ZONE 'America/Sao_Paulo' AS entrada, plate, daily_ticket, anterior
FROM (
  SELECT (entry_time AT TIME ZONE 'America/Sao_Paulo')::date AS dia, entry_time, plate, daily_ticket,
         LAG(daily_ticket) OVER (PARTITION BY (entry_time AT TIME ZONE 'America/Sao_Paulo')::date
                                 ORDER BY entry_time) AS anterior
  FROM vehicles
) x
WHERE anterior IS NOT NULL AND daily_ticket <= anterior
ORDER BY dia DESC, entrada;

-- 6) CONTADOR DO BANCO (depois da migração): último nº entregue por dia
SELECT * FROM daily_ticket_counters ORDER BY dia DESC LIMIT 10;

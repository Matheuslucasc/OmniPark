-- ============================================================
-- OmniPark — Schema PostgreSQL
-- Compatível com Vercel Postgres / Supabase / Neon
-- ============================================================

-- Permissões: NÃO desligue o RLS das tabelas. O acesso é liberado só para
-- usuários APROVADOS pela seção "SEGURANÇA" no fim deste arquivo. Se algo não
-- salvar, confira se o usuário está aprovado em profiles (approved = true).

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Tabela: vehicles
-- Registra entradas e saídas de veículos
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate         VARCHAR(10)    NOT NULL,
  vehicle_name  VARCHAR(100),
  entry_time    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  exit_time     TIMESTAMPTZ,
  amount_paid   DECIMAL(10,2),
  status        VARCHAR(10)    NOT NULL DEFAULT 'parked'
                  CHECK (status IN ('parked', 'exited')),
  daily_ticket  INTEGER,                                         -- nº sequencial do dia (001...)
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Para bancos já existentes, adicione a coluna (seguro rodar de novo):
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS daily_ticket INTEGER;

CREATE INDEX IF NOT EXISTS idx_vehicles_plate  ON vehicles (plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);
CREATE INDEX IF NOT EXISTS idx_vehicles_entry  ON vehicles (entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_exit   ON vehicles (exit_time  DESC);

-- ============================================================
-- Tabela: parking_settings
-- Configurações gerais do estacionamento (uma única linha)
-- ============================================================
CREATE TABLE IF NOT EXISTS parking_settings (
  id                      SERIAL PRIMARY KEY,
  total_spots             INTEGER        NOT NULL DEFAULT 25,
  parking_name            VARCHAR(200)   NOT NULL DEFAULT 'Estacionamento Central',
  parking_address         VARCHAR(300),
  parking_phone           VARCHAR(30),
  parking_cnpj            VARCHAR(20),
  ticket_observation      TEXT,
  -- Precificação
  tolerance_minutes       INTEGER        NOT NULL DEFAULT 15,
  first_hour_price        DECIMAL(10,2)  NOT NULL DEFAULT 10.00,
  additional_hour_price   DECIMAL(10,2)  NOT NULL DEFAULT 5.00,
  daily_max_price         DECIMAL(10,2)  NOT NULL DEFAULT 50.00,
  round_up_minutes        INTEGER        NOT NULL DEFAULT 10,
  -- Modo de cobrança: 'hourly' (por hora) ou 'fixed' (valor fixo — eventos)
  charge_mode             VARCHAR(10)    NOT NULL DEFAULT 'hourly',
  fixed_price             DECIMAL(10,2)  NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Linha única de configuração (id = 1). O app grava e lê SEMPRE esta linha.
-- (Antes era "DEFAULT VALUES": cada vez que este arquivo rodava, criava uma
-- linha nova com os padrões, e o app às vezes lia a errada.)
INSERT INTO parking_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Tabela: camera_settings
-- Câmeras IP configuradas para leitura de placas
-- ============================================================
CREATE TABLE IF NOT EXISTS camera_settings (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100)   NOT NULL,
  ip_address    VARCHAR(45)    NOT NULL,                          -- IPv4 ou IPv6
  port          INTEGER        NOT NULL DEFAULT 554,
  protocol      VARCHAR(10)    NOT NULL DEFAULT 'rtsp'
                  CHECK (protocol IN ('rtsp', 'http', 'https')),
  stream_path   VARCHAR(300)   DEFAULT '/stream',
  username      VARCHAR(100),
  password      VARCHAR(255),                                     -- armazene com hash em produção
  location      VARCHAR(100),                                     -- ex: "Entrada", "Saída", "Lateral"
  is_active     BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Apenas uma câmera ativa por vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_camera_active
  ON camera_settings (is_active)
  WHERE is_active = TRUE;

-- ============================================================
-- Tabela: plate_reads
-- Log de todas as placas lidas pelas câmeras
-- ============================================================
CREATE TABLE IF NOT EXISTS plate_reads (
  id            SERIAL PRIMARY KEY,
  camera_id     INTEGER        REFERENCES camera_settings (id) ON DELETE SET NULL,
  plate         VARCHAR(10)    NOT NULL,
  confidence    DECIMAL(5,2),                                     -- % de confiança do OCR
  image_url     TEXT,                                             -- caminho/URL da imagem capturada
  read_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  processed     BOOLEAN        NOT NULL DEFAULT FALSE             -- TRUE após vincular a um vehicle
);

CREATE INDEX IF NOT EXISTS idx_plate_reads_plate     ON plate_reads (plate);
CREATE INDEX IF NOT EXISTS idx_plate_reads_read_at   ON plate_reads (read_at DESC);
CREATE INDEX IF NOT EXISTS idx_plate_reads_processed ON plate_reads (processed);

-- ── Realtime da plate_reads ────────────────────────────────────────────────
-- O site escuta os INSERTs desta tabela em tempo real para preencher a placa.
-- Duas coisas são necessárias e SÓ AS DUAS JUNTAS fazem o site atualizar:
--   1) a tabela na publicação supabase_realtime (o bloco abaixo, idempotente);
--   2) RLS habilitado COM policy de SELECT para o anon — o Realtime usa o RLS
--      para autorizar a entrega; com RLS desligado ele NÃO entrega os eventos,
--      mesmo o anon conseguindo ler por REST. (Testado: sem isto, evento não
--      chega no site.)
-- A API grava com a CHAVE ANON, por isso também há policy de INSERT — sem ela,
-- ligar o RLS quebraria a gravação.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE plate_reads;
EXCEPTION WHEN duplicate_object THEN
  NULL;  -- já estava na publicação
END $$;

ALTER TABLE plate_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plate_reads select publico" ON plate_reads;
CREATE POLICY "plate_reads select publico"
  ON plate_reads FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "plate_reads insert publico" ON plate_reads;
CREATE POLICY "plate_reads insert publico"
  ON plate_reads FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============================================================
-- Tabela: plate_corrections
-- Guarda o que o OCR leu vs. a placa que o operador confirmou.
-- Serve para medir a taxa de acerto e, no futuro, treinar/afinar o modelo
-- com as placas reais deste estacionamento (foto + texto correto).
-- ============================================================
CREATE TABLE IF NOT EXISTS plate_corrections (
  id            SERIAL PRIMARY KEY,
  ocr_plate     VARCHAR(10),                                     -- o que o OCR leu
  final_plate   VARCHAR(10)    NOT NULL,                         -- o que o operador confirmou
  was_corrected BOOLEAN        NOT NULL DEFAULT FALSE,           -- ocr != final
  image_url     TEXT,                                            -- foto da placa lida
  camera_id     INTEGER        REFERENCES camera_settings (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plate_corrections_created  ON plate_corrections (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plate_corrections_wascorr  ON plate_corrections (was_corrected);

-- ============================================================
-- View: dashboard_stats
-- Estatísticas prontas para o painel (últimas 24h)
-- ============================================================
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM vehicles WHERE status = 'parked')                          AS occupied_spots,
  (SELECT total_spots FROM parking_settings LIMIT 1)
    - (SELECT COUNT(*) FROM vehicles WHERE status = 'parked')                      AS available_spots,
  COALESCE((
    SELECT SUM(amount_paid)
    FROM vehicles
    WHERE status = 'exited'
      AND exit_time >= CURRENT_DATE
  ), 0)                                                                             AS today_revenue,
  (
    SELECT COUNT(*)
    FROM vehicles
    WHERE entry_time >= CURRENT_DATE
  )                                                                                 AS today_vehicles;

-- ============================================================
-- Função + Trigger: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_camera_settings_updated_at
  BEFORE UPDATE ON camera_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_parking_settings_updated_at
  BEFORE UPDATE ON parking_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Tabela: price_modules
-- Tarifas especiais (ex: Festa do Pinhão, Show, Feriado)
-- ============================================================
CREATE TABLE IF NOT EXISTS price_modules (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(100)   NOT NULL,
  description           TEXT,
  tolerance_minutes     INTEGER        NOT NULL DEFAULT 15,
  first_hour_price      DECIMAL(10,2)  NOT NULL,
  additional_hour_price DECIMAL(10,2)  NOT NULL,
  daily_max_price       DECIMAL(10,2)  NOT NULL,
  round_up_minutes      INTEGER        NOT NULL DEFAULT 10,
  charge_mode           VARCHAR(10)    NOT NULL DEFAULT 'hourly',
  fixed_price           DECIMAL(10,2)  NOT NULL DEFAULT 0,
  is_active             BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tabela: profiles
-- Usuários do sistema com controle de aprovação pelo admin
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      VARCHAR(255),
  name       VARCHAR(100),
  approved   BOOLEAN        NOT NULL DEFAULT FALSE,
  role       VARCHAR(20)    NOT NULL DEFAULT 'operator'
               CHECK (role IN ('admin', 'operator')),
  created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Trigger: cria perfil automaticamente ao registrar usuário
-- IMPORTANTE: execute este bloco separadamente no SQL Editor
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Política: usuário autenticado pode ler o próprio perfil
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem ler proprio perfil" ON profiles;
CREATE POLICY "usuarios podem ler proprio perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Para aprovar um usuário, execute no SQL Editor do Supabase:
-- UPDATE profiles SET approved = true WHERE email = 'usuario@email.com';
-- Para tornar admin:
-- UPDATE profiles SET approved = true, role = 'admin' WHERE email = 'admin@email.com';

-- ============================================================
-- MIGRAÇÃO: modo de cobrança por valor fixo (eventos)
-- Execute no SQL Editor do Supabase em bancos já existentes.
-- É seguro rodar mais de uma vez.
-- ============================================================
ALTER TABLE parking_settings
  ADD COLUMN IF NOT EXISTS charge_mode VARCHAR(10)   NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS fixed_price DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE price_modules
  ADD COLUMN IF NOT EXISTS charge_mode VARCHAR(10)   NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS fixed_price DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Recarrega o cache de schema do PostgREST para as novas colunas valerem na hora
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRAÇÃO: padrão de 25 vagas
-- Muda o valor padrão da coluna (afeta só instalações novas).
-- ============================================================
ALTER TABLE parking_settings ALTER COLUMN total_spots SET DEFAULT 25;

-- OPCIONAL: aplicar 25 vagas no banco atual (só se ainda estiver no padrão antigo de 50).
-- Depois disso continua sendo possível alterar em Configurações → Total de Vagas.
-- UPDATE parking_settings SET total_spots = 25 WHERE total_spots = 50;

-- ============================================================
-- MIGRAÇÃO: sincronização de veículos entre aparelhos (Realtime)
-- Faz uma entrada registrada no celular aparecer na hora no computador
-- (e permite imprimir o ticket por lá). Seguro rodar mais de uma vez.
-- Assim como na plate_reads, o Realtime só entrega eventos com RLS ligado
-- e uma policy de SELECT para quem escuta (usuários logados).
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
EXCEPTION WHEN duplicate_object THEN
  NULL;  -- já estava na publicação
END $$;

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
-- A policy de acesso fica na seção "SEGURANÇA" abaixo (só usuários APROVADOS).
-- Não recrie aqui uma policy aberta (USING true): ela anularia a proteção.

-- ============================================================
-- MIGRAÇÃO: numeração de tickets feita pelo BANCO (2026-11)
-- Antes, cada aparelho calculava "maior nº de hoje + 1" com a lista que tinha
-- na memória: dois aparelhos ao mesmo tempo (ou um aparelho desatualizado)
-- podiam gerar o MESMO número, e excluir o último ticket fazia o número ser
-- reaproveitado. Agora um contador por dia, atualizado de forma atômica,
-- numera cada entrada: nunca repete e nunca reaproveita. O dia segue o
-- horário de Brasília. Seguro rodar mais de uma vez; vale a partir de agora
-- (não renumera tickets antigos — para conferir os antigos, use
-- sql/conferencia-tickets.sql).
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_ticket_counters (
  dia            DATE    PRIMARY KEY,
  ultimo_numero  INTEGER NOT NULL
);
-- Sem policies: só a função abaixo (SECURITY DEFINER) mexe no contador.
ALTER TABLE daily_ticket_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assign_daily_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dia    DATE        := (NEW.entry_time AT TIME ZONE 'America/Sao_Paulo')::date;
  v_inicio TIMESTAMPTZ := v_dia::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_max    INTEGER;
BEGIN
  -- Maior nº já usado no dia (cobre a 1ª execução no meio de um dia já numerado)
  SELECT COALESCE(MAX(daily_ticket), 0) INTO v_max
    FROM vehicles
   WHERE entry_time >= v_inicio AND entry_time < v_inicio + INTERVAL '1 day';

  -- Incremento atômico: entradas simultâneas esperam a vez na linha do dia
  INSERT INTO daily_ticket_counters AS c (dia, ultimo_numero)
       VALUES (v_dia, v_max + 1)
  ON CONFLICT (dia) DO UPDATE
       SET ultimo_numero = GREATEST(c.ultimo_numero, v_max) + 1
  RETURNING ultimo_numero INTO NEW.daily_ticket;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_daily_ticket ON vehicles;
CREATE TRIGGER trg_vehicles_daily_ticket
  BEFORE INSERT ON vehicles
  FOR EACH ROW EXECUTE FUNCTION public.assign_daily_ticket();

-- ============================================================
-- MIGRAÇÃO: uma placa só pode ter UM bilhete ativo
-- Impede entrada duplicada quando dois aparelhos registram a mesma placa ao
-- mesmo tempo. Se já houver duplicadas no pátio, só avisa (resolva com a
-- consulta 4 de sql/conferencia-tickets.sql e rode de novo).
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vehicles WHERE status = 'parked' GROUP BY plate HAVING COUNT(*) > 1) THEN
    RAISE NOTICE 'ATENCAO: ha placas com mais de um bilhete ativo. Resolva e rode este bloco de novo.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_plate_parked ON vehicles (plate) WHERE status = 'parked';
  END IF;
END $$;

-- ============================================================
-- SEGURANÇA: acesso só para usuários APROVADOS
-- Antes, qualquer pessoa que criasse uma conta (mesmo sem aprovação) já
-- conseguia ler/alterar veículos e faturamento direto pela API, porque a
-- aprovação só era checada na tela. Agora o próprio banco exige aprovação.
-- Remove TODAS as policies antigas destas tabelas (inclusive abertas criadas
-- à mão) e cria uma única: usuários aprovados têm acesso total.
-- Seguro rodar mais de uma vez.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved);
$$;
REVOKE ALL ON FUNCTION public.is_approved_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_user() TO authenticated;

DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicles', 'parking_settings', 'price_modules', 'plate_corrections'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "usuarios aprovados" ON public.%I FOR ALL TO authenticated '
      'USING ((SELECT public.is_approved_user())) WITH CHECK ((SELECT public.is_approved_user()))', t);
  END LOOP;
END $$;

-- A view dashboard_stats rodava com permissão do dono (ignorava o RLS) e
-- expunha ocupação e faturamento do dia para qualquer um com a chave pública.
DO $$
BEGIN
  EXECUTE 'ALTER VIEW public.dashboard_stats SET (security_invoker = true)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'dashboard_stats: %', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- SEGURANÇA — PARTE 2 (câmeras). Rode SÓ DEPOIS de cadastrar a variável
-- SUPABASE_SERVICE_ROLE_KEY na Vercel (Settings → Environment Variables,
-- valor = chave "service_role" em Supabase → Settings → API) e fazer um
-- redeploy. Sem isso, o leitor Python deixa de achar a câmera ativa.
-- A tabela guarda usuário/senha das câmeras: hoje qualquer um com a chave
-- pública do site consegue ler.
-- ------------------------------------------------------------
-- DO $$
-- DECLARE p RECORD;
-- BEGIN
--   ALTER TABLE public.camera_settings ENABLE ROW LEVEL SECURITY;
--   FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'camera_settings' LOOP
--     EXECUTE format('DROP POLICY %I ON public.camera_settings', p.policyname);
--   END LOOP;
--   CREATE POLICY "usuarios aprovados" ON public.camera_settings FOR ALL TO authenticated
--     USING ((SELECT public.is_approved_user())) WITH CHECK ((SELECT public.is_approved_user()));
-- END $$;

-- ============================================================
-- MIGRAÇÃO: preços sincronizados em tempo real entre aparelhos
-- Ao mudar a tabela de preços (ex.: ligar o valor fixo no início do evento)
-- em um aparelho, os outros passam a cobrar o novo valor na hora, sem
-- precisar recarregar a página.
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE parking_settings;
EXCEPTION WHEN duplicate_object THEN
  NULL;  -- já estava na publicação
END $$;

-- ============================================================
-- CORREÇÃO: configurações "voltando" depois de salvar (2026-11-11)
-- Rodar o schema.sql de novo criava linhas extras em parking_settings com
-- os valores padrão. O app salva na linha 1, mas lia "a primeira que viesse"
-- e às vezes pegava uma linha extra — as configurações pareciam não salvar.
-- Aqui: apaga as linhas extras (o app nunca usou nenhuma delas) e impede que
-- surjam de novo. Seguro rodar mais de uma vez.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM parking_settings WHERE id = 1) THEN
    DELETE FROM parking_settings WHERE id <> 1;
  ELSE
    -- Sem a linha 1 (caso raro): a mais antiga passa a ser a oficial
    DELETE FROM parking_settings WHERE id > (SELECT MIN(id) FROM parking_settings);
    UPDATE parking_settings SET id = 1;
  END IF;

  BEGIN
    ALTER TABLE parking_settings ADD CONSTRAINT parking_settings_linha_unica CHECK (id = 1);
  EXCEPTION WHEN duplicate_object THEN
    NULL;  -- já existia
  END;
END $$;

NOTIFY pgrst, 'reload schema';

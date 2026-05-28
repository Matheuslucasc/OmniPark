-- ============================================================
-- OmniPark — Schema PostgreSQL
-- Compatível com Vercel Postgres / Supabase / Neon
-- ============================================================

-- !! RODE ESTE BLOCO PRIMEIRO SE VEÍCULOS NÃO ESTÃO SENDO SALVOS !!
-- Garante acesso total às tabelas para usuários autenticados
-- (execute no SQL Editor do Supabase)
--
-- ALTER TABLE vehicles       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_modules   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE camera_settings DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE plate_reads     DISABLE ROW LEVEL SECURITY;
--
-- OU, se preferir manter RLS, crie as políticas:
-- CREATE POLICY "auth users full access on vehicles"
--   ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "auth users full access on price_modules"
--   ON price_modules FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

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
  total_spots             INTEGER        NOT NULL DEFAULT 50,
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
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Garante que só existe uma linha de configuração
INSERT INTO parking_settings DEFAULT VALUES
  ON CONFLICT DO NOTHING;

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

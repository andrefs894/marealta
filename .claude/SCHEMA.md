# Database Schema (Supabase)

## praias (static beach data — imported from APA/dados.gov.pt)
```sql
CREATE TABLE praias (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  concelho TEXT,
  distrito TEXT,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  tipo TEXT, -- 'costeira', 'fluvial', 'albufeira'
  bandeira_azul BOOLEAN DEFAULT FALSE,
  nadador_salvador BOOLEAN DEFAULT FALSE,
  acessivel BOOLEAN DEFAULT FALSE,
  restaurante BOOLEAN DEFAULT FALSE,
  estacionamento TEXT, -- 'gratuito', 'pago', 'inexistente'
  estacionamento_capacidade INTEGER,
  estacionamento_distancia_metros INTEGER,
  descricao TEXT,
  ipma_global_id INTEGER,        -- legacy; pre-Open-Meteo each beach pointed at the nearest IPMA station. Still populated for ~760 beaches but unused — meteo_horaria/meteo_diario now key on praia_id directly.
  google_place_id TEXT,          -- populated by n8n match-google-places workflow
  google_rating NUMERIC(2,1),    -- 1.0–5.0
  google_review_count INTEGER,
  fotos_verificadas_em TIMESTAMPTZ,    -- last time photos workflow ran for this beach (NULL = never; non-NULL even when zero photos found, so we don't re-fetch)
  pontos_verificados_em TIMESTAMPTZ,   -- same idea for nearby-places workflow
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## meteo_horaria (hourly forecast per beach — updated hourly via Supabase Edge Functions)
Per-beach hourly forecasts from Open-Meteo (Forecast API + Marine API).
~760 beaches × 120 forecast hours ≈ 91K rows; refreshed in place every hour
via `meteo-praia-horaria` (pg_cron at minute 5 each hour, UTC).

```sql
CREATE TABLE meteo_horaria (
  id BIGSERIAL PRIMARY KEY,
  praia_id BIGINT NOT NULL REFERENCES praias(id) ON DELETE CASCADE,
  hora_utc TIMESTAMPTZ NOT NULL,             -- forecast hour, UTC

  -- Atmospheric (Open-Meteo Forecast API)
  temp DECIMAL(4,1),                         -- °C at 2 m
  precipitacao DECIMAL(5,2),                 -- mm in that hour
  precipitacao_prob INTEGER,                 -- 0–100 %
  vento_velocidade DECIMAL(5,1),             -- km/h at 10 m
  vento_direcao INTEGER,                     -- degrees
  vento_intensidade INTEGER,                 -- 0–9 Beaufort-like class (derived; used by scoring engine)
  vento_rajada DECIMAL(5,1),                 -- km/h gust
  uv_index DECIMAL(3,1),
  weather_code INTEGER,                      -- WMO code
  estado_tempo TEXT,                         -- Portuguese label derived from weather_code

  -- Marine (Open-Meteo Marine API; null for inland beaches)
  temp_agua DECIMAL(4,1),                    -- sea-surface temp °C
  ondulacao_altura DECIMAL(4,2),             -- significant wave height m

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(praia_id, hora_utc)
);
CREATE INDEX ON meteo_horaria (praia_id, hora_utc);
CREATE INDEX ON meteo_horaria (hora_utc);
```

## meteo_diario (view — per-beach daily aggregate over Europe/Lisbon days)
Aggregates `meteo_horaria` into one row per `(praia_id, data)` for the
homepage's "best beach today" list. Frontend reads exposed via the
`useMeteo` / `usePraiaComMeteo` hooks. Note: this is now a VIEW, not a
table — the underlying data lives in `meteo_horaria`.

```sql
CREATE VIEW meteo_diario AS
SELECT
  praia_id,
  (hora_utc AT TIME ZONE 'Europe/Lisbon')::date AS data,
  MIN(temp) AS temp_min,
  MAX(temp) AS temp_max,
  SUM(precipitacao) AS precipitacao,           -- mm/day total
  MAX(precipitacao_prob) AS precipitacao_prob, -- peak hourly %
  MAX(uv_index) AS uv_index,
  -- afternoon (12–18 local) values for wind & state
  MAX(vento_intensidade) FILTER (...) AS vento_intensidade,
  (array_agg(vento_direcao ...) FILTER (...))[1] AS vento_direcao,
  (array_agg(estado_tempo ...) FILTER (...))[1] AS estado_tempo,
  AVG(temp_agua) AS temp_agua,
  AVG(ondulacao_altura) AS ondulacao_altura,
  MAX(updated_at) AS updated_at
FROM meteo_horaria
GROUP BY praia_id, (hora_utc AT TIME ZONE 'Europe/Lisbon')::date;
```

## qualidade_agua (bathing water quality — updated weekly via n8n)
```sql
CREATE TABLE qualidade_agua (
  id SERIAL PRIMARY KEY,
  praia_id INTEGER REFERENCES praias(id),
  classificacao TEXT, -- 'excelente', 'boa', 'aceitavel', 'ma'
  data_analise DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## ocupacao_horaria (Google popular_times — updated monthly via n8n)
Hourly busyness scores (0–100) per beach, scraped from Google Maps via SerpAPI.
~168 rows per beach (7 days × 24 hours). Frontend reads via `src/lib/ocupacao.ts` (currently uses heuristic fallback when no row exists).

```sql
CREATE TABLE ocupacao_horaria (
  id SERIAL PRIMARY KEY,
  praia_id INTEGER REFERENCES praias(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL,        -- 0=Sunday … 6=Saturday
  hora INTEGER NOT NULL,              -- 0–23
  nivel_ocupacao INTEGER,             -- 0–100
  fonte TEXT DEFAULT 'serpapi_popular_times',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(praia_id, dia_semana, hora)
);
```

## praia_fotos (Google Places photos — updated monthly via n8n)
Up to 10 photos per beach, fetched from Google Places Photos API. Attribution string is required by Google ToS and must be displayed alongside each photo.

```sql
CREATE TABLE praia_fotos (
  id BIGSERIAL PRIMARY KEY,
  praia_id BIGINT NOT NULL REFERENCES praias(id) ON DELETE CASCADE,
  url TEXT NOT NULL,                  -- resolved Google Places photo URL
  largura INTEGER,
  altura INTEGER,
  attribution TEXT,                   -- required by Google ToS
  ordem INTEGER DEFAULT 0,            -- display order; 0 = primary
  fonte TEXT DEFAULT 'google_places',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON praia_fotos (praia_id, ordem);
```

## pontos_interesse (nearby restaurants/bars/cafes — updated monthly via n8n)
Top ~5 restaurants/bars/cafes within 500m of each beach, ranked by `rating × log(review_count)`. Refreshed by `nearby-places.json` n8n workflow (delete-by-praia_id then insert).

```sql
CREATE TABLE pontos_interesse (
  id BIGSERIAL PRIMARY KEY,
  praia_id BIGINT NOT NULL REFERENCES praias(id) ON DELETE CASCADE,
  google_place_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT,                          -- 'restaurante' | 'bar' | 'cafe'
  rating NUMERIC(2,1),
  review_count INTEGER,
  foto_url TEXT,
  foto_attr TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distancia_metros INTEGER,
  endereco TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(praia_id, google_place_id)
);
CREATE INDEX ON pontos_interesse (praia_id, rating DESC);
```

## user_profiles (synced version of localStorage profile, after Google login)
```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT,                          -- 'familia' | 'tranquila' | 'surf' | 'social'
  localizacao_lat DOUBLE PRECISION,
  localizacao_lng DOUBLE PRECISION,
  municipio TEXT,
  distancia_maxima INTEGER,           -- km
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- RLS: owner-only read/write
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read"  ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner write" ON user_profiles FOR ALL    USING (auth.uid() = user_id);
```

## user_favoritas (synced favorites, after Google login)
Pre-login favorites live in localStorage as `mare_alta_favoritas` (number[]). On login, they are migrated here (union with any existing remote rows).

```sql
CREATE TABLE user_favoritas (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  praia_id BIGINT NOT NULL REFERENCES praias(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, praia_id)
);
ALTER TABLE user_favoritas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read"  ON user_favoritas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner write" ON user_favoritas FOR ALL    USING (auth.uid() = user_id);
```

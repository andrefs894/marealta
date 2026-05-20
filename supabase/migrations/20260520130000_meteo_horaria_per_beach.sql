-- Migration: replace IPMA station-keyed meteo_diario with per-beach hourly
-- forecasts sourced from Open-Meteo. The Edge Function meteo-praia-horaria
-- writes meteo_horaria; the old meteo_diario name is preserved as a view that
-- aggregates today's hourly rows so the frontend can keep its existing query
-- shape (one row per beach per day) without code changes beyond the join key.
--
-- Order: unschedule old jobs first → drop old table → create new shape →
-- schedule new job. The migration assumes the meteo-praia-horaria Edge
-- Function has already been deployed (we deploy code before applying SQL).

-- 1. Unschedule old IPMA cron jobs (do this BEFORE dropping the table they write to)
do $$
declare
  j text;
begin
  for j in
    select jobname from cron.job
    where jobname in ('meteo-diario', 'mar-e-temperatura', 'uv-index')
  loop
    perform cron.unschedule(j);
  end loop;
end $$;

-- 2. Drop the old station-keyed table. Data was 2x-daily IPMA forecasts;
--    new pipeline regenerates hourly per-beach data within an hour.
drop table if exists meteo_diario cascade;

-- 3. Per-beach hourly forecasts.
--    praia_id × hora_utc unique; ~760 beaches × 120 forecast hours ≈ 91K rows.
--    Upserts replace existing rows so storage stays bounded.
create table meteo_horaria (
  id                 bigserial primary key,
  praia_id           bigint not null references praias(id) on delete cascade,
  hora_utc           timestamptz not null,                -- forecast hour, UTC

  -- Atmospheric (Open-Meteo Forecast API)
  temp               decimal(4,1),                        -- °C at 2 m
  precipitacao       decimal(5,2),                        -- mm in that hour
  precipitacao_prob  integer,                             -- 0–100 %
  vento_velocidade   decimal(5,1),                        -- km/h at 10 m
  vento_direcao      integer,                             -- degrees
  vento_intensidade  integer,                             -- 0–9 Beaufort-like class (for scoring back-compat)
  vento_rajada       decimal(5,1),                        -- km/h gust
  uv_index           decimal(3,1),
  weather_code       integer,                             -- WMO code from Open-Meteo
  estado_tempo       text,                                -- Portuguese label derived from weather_code

  -- Marine (Open-Meteo Marine API; null for inland beaches)
  temp_agua          decimal(4,1),                        -- sea-surface temp °C
  ondulacao_altura   decimal(4,2),                        -- significant wave height m

  updated_at         timestamptz default now(),
  unique (praia_id, hora_utc)
);
create index on meteo_horaria (praia_id, hora_utc);
create index on meteo_horaria (hora_utc);

-- 4. meteo_diario as a view: per-beach daily aggregate over Europe/Lisbon days.
--    Same name as the old table so frontend hooks only need their join key
--    changed (from ipma_global_id to praia_id). Aggregations:
--      - temp_min/max: daily extremes
--      - precipitacao: total mm/day
--      - uv_index: daily peak
--      - wind & estado_tempo: representative afternoon value (12–18 local)
--      - temp_agua / ondulacao_altura: daily average
create view meteo_diario as
select
  praia_id,
  (hora_utc at time zone 'Europe/Lisbon')::date as data,
  min(temp)::decimal(4,1) as temp_min,
  max(temp)::decimal(4,1) as temp_max,
  round(sum(precipitacao)::numeric, 1)::decimal(5,1) as precipitacao,
  max(precipitacao_prob) as precipitacao_prob,
  max(uv_index)::decimal(3,1) as uv_index,
  max(vento_intensidade)
    filter (where extract(hour from hora_utc at time zone 'Europe/Lisbon') between 12 and 18)
    as vento_intensidade,
  (array_agg(vento_direcao order by hora_utc)
     filter (where extract(hour from hora_utc at time zone 'Europe/Lisbon') = 14))[1]
    as vento_direcao,
  (array_agg(estado_tempo order by hora_utc)
     filter (where extract(hour from hora_utc at time zone 'Europe/Lisbon') = 14))[1]
    as estado_tempo,
  round(avg(temp_agua)::numeric, 1)::decimal(4,1) as temp_agua,
  round(avg(ondulacao_altura)::numeric, 2)::decimal(4,2) as ondulacao_altura,
  max(updated_at) as updated_at
from meteo_horaria
group by praia_id, (hora_utc at time zone 'Europe/Lisbon')::date;

comment on view meteo_diario is
  'Per-beach daily aggregate of meteo_horaria over Europe/Lisbon days. Frontend reads this for the homepage; meteo_horaria directly for hourly detail.';

-- 5. Schedule the new hourly job. Runs at minute 5 to avoid the top-of-hour
--    contention with other Supabase scheduled work.
select cron.schedule(
  'meteo-praia-horaria',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://kesxtxxnovgzhwaoiiza.supabase.co/functions/v1/meteo-praia-horaria',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $$
);

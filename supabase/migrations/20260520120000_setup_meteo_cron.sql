-- Schedule the 3 IPMA Edge Functions via pg_cron + pg_net.
-- IMPORTANT: before running this migration, do TWO manual steps in the Supabase dashboard:
--   1. Settings → Vault → New secret named "service_role_key" (paste the project's service-role key)
--   2. Replace kesxtxxnovgzhwaoiiza below with your project ref (e.g. abcd1234) — found in the dashboard URL
--
-- Cron times are UTC. They match the previous n8n schedule so behaviour stays identical.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop existing jobs with these names before recreating
do $$
declare
  jobname text;
begin
  for jobname in
    select j.jobname from cron.job j
    where j.jobname in ('meteo-diario', 'mar-e-temperatura', 'uv-index')
  loop
    perform cron.unschedule(jobname);
  end loop;
end $$;

-- 1. meteo-diario at 00:00 and 12:00 UTC — creates today's rows
select cron.schedule(
  'meteo-diario',
  '0 0,12 * * *',
  $$
  select net.http_post(
    url := 'https://kesxtxxnovgzhwaoiiza.supabase.co/functions/v1/meteo-diario',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $$
);

-- 2. mar-e-temperatura at 00:05 and 12:05 UTC — fills temp_agua + ondulacao_altura
select cron.schedule(
  'mar-e-temperatura',
  '5 0,12 * * *',
  $$
  select net.http_post(
    url := 'https://kesxtxxnovgzhwaoiiza.supabase.co/functions/v1/mar-e-temperatura',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $$
);

-- 3. uv-index at 00:10 and 12:10 UTC — fills uv_index
select cron.schedule(
  'uv-index',
  '10 0,12 * * *',
  $$
  select net.http_post(
    url := 'https://kesxtxxnovgzhwaoiiza.supabase.co/functions/v1/uv-index',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $$
);

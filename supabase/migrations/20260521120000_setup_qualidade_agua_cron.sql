-- Schedule the qualidade-agua Edge Function via pg_cron + pg_net.
-- EEA WISE publishes the bathing-water assessment for season N late in year N,
-- so we run once a year on October 1st at 09:00 UTC to catch the freshest data.
-- (Replacing the dormant n8n workflow `n8n/workflows/qualidade-agua.json`.)
--
-- Prereqs (already in place from meteo-praia-horaria):
--   1. Vault secret `service_role_key` exists.
--   2. Project ref placeholder kesxtxxnovgzhwaoiiza below is correct.
--   3. Edge Function `qualidade-agua` is deployed (`supabase functions deploy qualidade-agua`).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ON CONFLICT (praia_id) in the function requires a unique index on praia_id.
-- Idempotent: harmless if it already exists from earlier ingest setup.
create unique index if not exists qualidade_agua_praia_id_key
  on qualidade_agua (praia_id);

-- Idempotent: drop existing job before recreating
do $$
begin
  if exists (select 1 from cron.job where jobname = 'qualidade-agua') then
    perform cron.unschedule('qualidade-agua');
  end if;
end $$;

-- Annual on October 1st at 09:00 UTC
select cron.schedule(
  'qualidade-agua',
  '0 9 1 10 *',
  $$
  select net.http_post(
    url := 'https://kesxtxxnovgzhwaoiiza.supabase.co/functions/v1/qualidade-agua',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    )
  );
  $$
);

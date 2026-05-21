-- Move meteo-praia-horaria from hourly to every-6-hours to fit Open-Meteo's
-- free tier (10,000 location-calls/day). Each run does ~1,329 calls (760
-- forecast + 569 marine for coastal beaches), so:
--   hourly:    1,329 × 24 = 31,896/day  → 3× over limit
--   every 6h:  1,329 ×  4 =  5,316/day  → 47% of quota, safe headroom
--
-- Cron offsets to :30 past the hour so Open-Meteo has time to publish each
-- 6-hourly model run (the underlying NWP refreshes at 00/06/12/18 UTC).
-- Running more often than 6h just re-fetches the same forecast values.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'meteo-praia-horaria') then
    perform cron.unschedule('meteo-praia-horaria');
  end if;
end $$;

select cron.schedule(
  'meteo-praia-horaria',
  '30 0,6,12,18 * * *',
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

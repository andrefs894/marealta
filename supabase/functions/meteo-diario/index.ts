// IPMA daily forecast → meteo_diario (35 stations × 5 days ≈ 175 rows).
// Ported from n8n/workflows/meteo-diario.json. Runs at 00:00 and 12:00 UTC
// via pg_cron (see supabase/migrations/*_setup_meteo_cron.sql).
//
// Sequence:
//   1. Fetch IPMA station list
//   2. Fetch each station's 5-day forecast (parallel)
//   3. Map to meteo_diario rows, applying TIPOS_TEMPO label
//   4. Upsert on (ipma_global_id, data)
//
// uv_index / temp_agua / ondulacao_altura are intentionally set to null —
// the mar-e-temperatura and uv-index functions refill them seconds later.
// This matches the n8n behaviour and prevents stale values from carrying
// over when a forecast row is refreshed.
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { TIPOS_TEMPO } from "../_shared/ipma-tipos-tempo.ts";

interface IpmaStation {
  globalIdLocal: number;
  local: string;
  latitude: string;
  longitude: string;
}

interface IpmaDailyForecast {
  forecastDate: string;
  tMin?: string;
  tMax?: string;
  precipitaProb?: string;
  predWindDir?: string;
  classWindSpeed?: number | string;
  idWeatherType?: number;
}

Deno.serve(async () => {
  const supabase = createServiceRoleClient();

  const stationsRes = await fetch("https://api.ipma.pt/open-data/distrits-islands.json");
  if (!stationsRes.ok) {
    throw new Error(`IPMA stations failed: ${stationsRes.status}`);
  }
  const stationsJson = await stationsRes.json();
  const stations: IpmaStation[] = stationsJson.data ?? [];

  const forecastResults = await Promise.all(
    stations.map(async (s) => {
      const r = await fetch(
        `https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${s.globalIdLocal}.json`,
      );
      if (!r.ok) {
        console.warn(`Station ${s.globalIdLocal} (${s.local}) failed: ${r.status}`);
        return { stationId: s.globalIdLocal, forecasts: [] as IpmaDailyForecast[] };
      }
      const j = await r.json();
      return { stationId: s.globalIdLocal, forecasts: (j.data ?? []) as IpmaDailyForecast[] };
    }),
  );

  const now = new Date().toISOString();
  const rows = forecastResults.flatMap(({ stationId, forecasts }) =>
    forecasts.map((d) => ({
      ipma_global_id: stationId,
      data: d.forecastDate,
      temp_min: d.tMin != null ? parseFloat(d.tMin) : null,
      temp_max: d.tMax != null ? parseFloat(d.tMax) : null,
      precipitacao: d.precipitaProb != null ? parseFloat(d.precipitaProb) : null,
      vento_direcao: d.predWindDir ?? null,
      vento_intensidade: d.classWindSpeed != null ? parseInt(String(d.classWindSpeed)) : null,
      uv_index: null,
      estado_tempo: d.idWeatherType != null ? TIPOS_TEMPO[d.idWeatherType] ?? null : null,
      temp_agua: null,
      ondulacao_altura: null,
      updated_at: now,
    }))
  );

  const { error } = await supabase
    .from("meteo_diario")
    .upsert(rows, { onConflict: "ipma_global_id,data" });

  if (error) {
    console.error("Upsert error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`meteo-diario: upserted ${rows.length} rows from ${stations.length} stations`);
  return new Response(
    JSON.stringify({ ok: true, stations: stations.length, rows: rows.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});

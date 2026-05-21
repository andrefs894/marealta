// Open-Meteo → meteo_horaria. Pulls a 5-day hourly forecast for every beach
// that has lat/lng, from both the Forecast API (atmospheric + UV) and the
// Marine API (waves + sea-surface temp), and upserts one row per
// (praia_id, hora_utc).
//
// Runs hourly via pg_cron (see supabase/migrations/*_meteo_horaria_per_beach.sql).
//
// Open-Meteo accepts batched coordinates in a single GET — we send ~100 beaches
// per request to stay safely below the URL-length limit. Beaches without
// lat/lng are skipped.
//
// Marine API:
//  * Only called for coastal beaches (`tipo = 'costeira'`). Inland beaches
//    (`fluvial`, `albufeira`) get NULL temp_agua/ondulacao_altura — Open-Meteo
//    sometimes snaps inland coords to nearby ocean cells, which produces
//    misleading "sea temperature" for reservoirs and rivers.
//  * Transient 429/5xx responses are retried with backoff. Before the retry
//    logic was added, a single rate-limited batch wrote nulls for ~100
//    coastal beaches and froze them until the next clean run.
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { WMO_TIPOS_TEMPO, ventoKmhToClasse } from "../_shared/wmo-tipos-tempo.ts";

const BATCH_SIZE = 100;          // beaches per Open-Meteo request
const UPSERT_CHUNK = 1000;       // rows per supabase upsert
const FORECAST_DAYS = 5;
const FETCH_RETRIES = 3;
// Open-Meteo free tier caps at 600 location-calls/min. Each batch is 100
// calls, so 10s between batches keeps us right at the ceiling. With 14 batches
// per run (8 forecast + 6 marine), the function takes ~140s wall-clock — well
// inside the 150s edge-function timeout.
const BATCH_PAUSE_MS = 10000;

interface Beach {
  id: number;
  latitude: number;
  longitude: number;
  tipo: string | null;
}

interface ForecastLocation {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    uv_index: (number | null)[];
    weather_code: (number | null)[];
  };
}

interface MarineLocation {
  hourly?: {
    time: string[];
    wave_height: (number | null)[];
    sea_surface_temperature: (number | null)[];
  };
}

interface MeteoHorariaRow {
  praia_id: number;
  hora_utc: string;
  temp: number | null;
  precipitacao: number | null;
  precipitacao_prob: number | null;
  vento_velocidade: number | null;
  vento_direcao: number | null;
  vento_intensidade: number | null;
  vento_rajada: number | null;
  uv_index: number | null;
  weather_code: number | null;
  estado_tempo: string | null;
  temp_agua: number | null;
  ondulacao_altura: number | null;
  updated_at: string;        // always send so ON CONFLICT updates the timestamp
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Open-Meteo returns naive ISO strings like "2026-05-20T08:00" in the
// timezone we requested (UTC for us). Postgres accepts that as a
// timestamptz once we append seconds + "Z".
function toUtcTimestamp(t: string): string {
  return t.endsWith("Z") ? t : `${t}:00Z`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retryable fetch with 429/5xx backoff. Returns the parsed JSON array or null
// on permanent failure. Open-Meteo is bursty: a single 429 is recovered from
// within a second or two.
async function fetchWithRetry(label: string, url: string, batchLen: number): Promise<unknown[] | null> {
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      return Array.isArray(j) ? j : [j];
    }
    if (r.status === 429 || r.status >= 500) {
      const wait = 1000 * attempt;
      console.warn(`${label} ${r.status} on batch of ${batchLen} (attempt ${attempt}/${FETCH_RETRIES}), backing off ${wait}ms`);
      await sleep(wait);
      continue;
    }
    console.warn(`${label} non-retryable ${r.status} for batch of ${batchLen}`);
    return null;
  }
  console.warn(`${label}: gave up after ${FETCH_RETRIES} attempts for batch of ${batchLen}`);
  return null;
}

async function fetchForecast(batch: Beach[]): Promise<ForecastLocation[] | null> {
  const params = new URLSearchParams({
    latitude: batch.map((b) => b.latitude).join(","),
    longitude: batch.map((b) => b.longitude).join(","),
    hourly: [
      "temperature_2m",
      "precipitation",
      "precipitation_probability",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "uv_index",
      "weather_code",
    ].join(","),
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS),
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  return (await fetchWithRetry("Forecast", url, batch.length)) as ForecastLocation[] | null;
}

async function fetchMarine(batch: Beach[]): Promise<MarineLocation[] | null> {
  const params = new URLSearchParams({
    latitude: batch.map((b) => b.latitude).join(","),
    longitude: batch.map((b) => b.longitude).join(","),
    hourly: ["wave_height", "sea_surface_temperature"].join(","),
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS),
  });
  const url = `https://marine-api.open-meteo.com/v1/marine?${params}`;
  return (await fetchWithRetry("Marine", url, batch.length)) as MarineLocation[] | null;
}

// Hoisted into a background task because total wall clock (~160s with the
// 10-second batch pacing required by Open-Meteo's 600/min limit) exceeds the
// 150s edge-function HTTP timeout on Supabase's free tier. Background tasks
// have a 200s ceiling on free tier — enough headroom for the worst case
// where every batch incurs one retry.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

async function runRefresh() {
  try {
    const supabase = createServiceRoleClient();

    // 1. Load all beaches that have coordinates
    const { data: beaches, error: praiasErr } = await supabase
      .from("praias")
      .select("id, latitude, longitude, tipo")
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    if (praiasErr) throw new Error(`Failed to load praias: ${praiasErr.message}`);
    const beachList: Beach[] = (beaches ?? []) as Beach[];
    const coastalList = beachList.filter((b) => b.tipo === "costeira");
    console.log(`meteo-praia-horaria: ${beachList.length} beaches total, ${coastalList.length} coastal (eligible for marine)`);

    // 2. Forecast (atmospheric+UV) for all beaches
    const forecastByBeach = new Map<number, ForecastLocation>();
    const forecastBatches = chunk(beachList, BATCH_SIZE);
    let forecastFailed = 0;
    for (const [i, batch] of forecastBatches.entries()) {
      if (i > 0) await sleep(BATCH_PAUSE_MS);
      const forecasts = await fetchForecast(batch);
      if (forecasts === null) { forecastFailed += batch.length; continue; }
      for (let k = 0; k < batch.length; k++) {
        if (forecasts[k]?.hourly) forecastByBeach.set(batch[k].id, forecasts[k]);
      }
      console.log(`Forecast batch ${i + 1}/${forecastBatches.length} done`);
    }
    if (forecastFailed) console.warn(`Forecast: ${forecastFailed} beaches missed this run`);

    // 3. Marine for coastal beaches only. Failed batches mean those beaches'
    //    marine columns get NULL this run; the next clean run fixes them.
    const marineByBeach = new Map<number, MarineLocation>();
    const marineBatches = chunk(coastalList, BATCH_SIZE);
    let marineFailed = 0;
    for (const [i, batch] of marineBatches.entries()) {
      if (i > 0) await sleep(BATCH_PAUSE_MS);
      const marines = await fetchMarine(batch);
      if (marines === null) { marineFailed += batch.length; continue; }
      for (let k = 0; k < batch.length; k++) {
        if (marines[k]) marineByBeach.set(batch[k].id, marines[k]);
      }
      console.log(`Marine batch ${i + 1}/${marineBatches.length} done`);
    }
    if (marineFailed) console.warn(`Marine: ${marineFailed} coastal beaches missed this run`);

    // 4. Build rows. Inland beaches always get null marine; coastal beaches get
    //    marine values when available, null otherwise.
    const now = new Date().toISOString();
    const allRows: MeteoHorariaRow[] = [];
    for (const beach of beachList) {
      const f = forecastByBeach.get(beach.id);
      if (!f?.hourly) continue;
      const m = beach.tipo === "costeira" ? marineByBeach.get(beach.id) : undefined;
      const times = f.hourly.time;
      for (let h = 0; h < times.length; h++) {
        const wmo = f.hourly.weather_code[h];
        const kmh = f.hourly.wind_speed_10m[h];
        const waveHt = m?.hourly?.wave_height?.[h] ?? null;
        const sst = m?.hourly?.sea_surface_temperature?.[h] ?? null;

        allRows.push({
          praia_id: beach.id,
          hora_utc: toUtcTimestamp(times[h]),
          temp: f.hourly.temperature_2m[h] ?? null,
          precipitacao: f.hourly.precipitation[h] ?? null,
          precipitacao_prob: f.hourly.precipitation_probability[h] ?? null,
          vento_velocidade: kmh ?? null,
          vento_direcao: f.hourly.wind_direction_10m[h] ?? null,
          vento_intensidade: ventoKmhToClasse(kmh),
          vento_rajada: f.hourly.wind_gusts_10m[h] ?? null,
          uv_index: f.hourly.uv_index[h] ?? null,
          weather_code: wmo ?? null,
          estado_tempo: wmo != null ? WMO_TIPOS_TEMPO[wmo] ?? null : null,
          temp_agua: sst,
          ondulacao_altura: waveHt,
          updated_at: now,
        });
      }
    }

    // 5. Upsert in chunks. Conflict target = (praia_id, hora_utc).
    let upserted = 0;
    for (const part of chunk(allRows, UPSERT_CHUNK)) {
      const { error } = await supabase
        .from("meteo_horaria")
        .upsert(part, { onConflict: "praia_id,hora_utc" });
      if (error) {
        console.error(`Upsert chunk failed (size ${part.length}):`, error.message);
        return new Response(
          JSON.stringify({ ok: false, error: error.message, upserted }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      upserted += part.length;
    }

    console.log(`meteo-praia-horaria: upserted ${upserted} rows; forecastFailed=${forecastFailed} marineFailed=${marineFailed}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error("meteo-praia-horaria fatal:", msg);
  }
}

Deno.serve(() => {
  // Kick off the long-running refresh in the background and return immediately.
  // Cron only cares that the HTTP call succeeded; the actual outcome lives in
  // function logs.
  EdgeRuntime.waitUntil(runRefresh());
  return new Response(
    JSON.stringify({ ok: true, started: true }),
    { headers: { "Content-Type": "application/json" } },
  );
});

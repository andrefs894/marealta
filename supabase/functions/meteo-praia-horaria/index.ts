// Open-Meteo → meteo_horaria. Pulls a 5-day hourly forecast for every beach
// that has lat/lng, from both the Forecast API (atmospheric + UV) and the
// Marine API (waves + sea-surface temp), and upserts one row per
// (praia_id, hora_utc).
//
// Runs hourly via pg_cron (see supabase/migrations/*_meteo_horaria_per_beach.sql).
//
// Open-Meteo accepts batched coordinates in a single GET — we send ~100 beaches
// per request to stay safely below the URL-length limit. Beaches without
// lat/lng are skipped. Inland beaches still get atmospheric data; the marine
// fields land as null when Open-Meteo has no oceanographic grid coverage.
import { createServiceRoleClient } from "../_shared/supabase.ts";
import { WMO_TIPOS_TEMPO, ventoKmhToClasse } from "../_shared/wmo-tipos-tempo.ts";

const BATCH_SIZE = 100;          // beaches per Open-Meteo request
const UPSERT_CHUNK = 1000;       // rows per supabase upsert
const FORECAST_DAYS = 5;

interface Beach {
  id: number;
  latitude: number;
  longitude: number;
}

// Open-Meteo returns ONE object for a single-location request, or an ARRAY
// when multiple latitude/longitude pairs are passed. We always pass multiple,
// so the shape is the array form.
interface ForecastLocation {
  hourly: {
    time: string[];                          // ISO strings, "...T08:00"
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

async function fetchForecast(batch: Beach[]): Promise<ForecastLocation[]> {
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
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo Forecast ${r.status} for batch of ${batch.length}`);
  const j = await r.json();
  // Single-location: returns object; multi: returns array. We always pass multi.
  return Array.isArray(j) ? j : [j];
}

async function fetchMarine(batch: Beach[]): Promise<MarineLocation[]> {
  const params = new URLSearchParams({
    latitude: batch.map((b) => b.latitude).join(","),
    longitude: batch.map((b) => b.longitude).join(","),
    hourly: ["wave_height", "sea_surface_temperature"].join(","),
    timezone: "UTC",
    forecast_days: String(FORECAST_DAYS),
  });
  const url = `https://marine-api.open-meteo.com/v1/marine?${params}`;
  const r = await fetch(url);
  if (!r.ok) {
    // Marine often 404s for inland points in some setups; log and return empty
    console.warn(`Open-Meteo Marine ${r.status} for batch of ${batch.length}`);
    return batch.map(() => ({}));
  }
  const j = await r.json();
  return Array.isArray(j) ? j : [j];
}

Deno.serve(async () => {
  try {
  const supabase = createServiceRoleClient();

  // 1. Load all beaches that have coordinates
  const { data: beaches, error: praiasErr } = await supabase
    .from("praias")
    .select("id, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (praiasErr) throw new Error(`Failed to load praias: ${praiasErr.message}`);
  const beachList: Beach[] = (beaches ?? []) as Beach[];
  console.log(`meteo-praia-horaria: ${beachList.length} beaches with coordinates`);

  // 2. Fetch Open-Meteo data in batches and build rows
  const allRows: MeteoHorariaRow[] = [];
  const batches = chunk(beachList, BATCH_SIZE);

  for (const [i, batch] of batches.entries()) {
    const [forecasts, marines] = await Promise.all([
      fetchForecast(batch),
      fetchMarine(batch),
    ]);

    for (let k = 0; k < batch.length; k++) {
      const beach = batch[k];
      const f = forecasts[k];
      const m = marines[k] ?? {};
      if (!f?.hourly) continue;

      const times = f.hourly.time;
      for (let h = 0; h < times.length; h++) {
        const wmo = f.hourly.weather_code[h];
        const kmh = f.hourly.wind_speed_10m[h];
        const waveHt = m.hourly?.wave_height?.[h] ?? null;
        const sst = m.hourly?.sea_surface_temperature?.[h] ?? null;

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
        });
      }
    }
    console.log(`Batch ${i + 1}/${batches.length} done (${batch.length} beaches)`);
  }

  // 3. Upsert in chunks. Conflict target = (praia_id, hora_utc).
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

  console.log(`meteo-praia-horaria: upserted ${upserted} rows for ${beachList.length} beaches`);
  return new Response(
    JSON.stringify({ ok: true, beaches: beachList.length, rows: upserted }),
    { headers: { "Content-Type": "application/json" } },
  );
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error("meteo-praia-horaria fatal:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

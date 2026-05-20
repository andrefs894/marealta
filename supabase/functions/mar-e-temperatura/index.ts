// IPMA sea forecast → fills temp_agua + ondulacao_altura on today's
// meteo_diario rows. Ported from n8n/workflows/mar-e-temperatura.json.
// Runs at 00:05 and 12:05 UTC, five minutes after meteo-diario has
// created today's station rows.
//
// IPMA only publishes sea-state data for ~10 coastal points, so we match
// each of the 35 weather stations to its nearest sea station via Haversine
// distance, then UPDATE today's row for that station.
import { createServiceRoleClient } from "../_shared/supabase.ts";

interface IpmaStation {
  globalIdLocal: number;
  latitude: string;
  longitude: string;
}

interface SeaStation {
  latitude: number;
  longitude: number;
  sstMin?: string;
  sstMax?: string;
  waveHighMin?: string;
  waveHighMax?: string;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function avg(a: number, b: number): number | null {
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round(((a + b) / 2) * 10) / 10;
}

Deno.serve(async () => {
  const supabase = createServiceRoleClient();

  const [seaRes, stationsRes] = await Promise.all([
    fetch("https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day0.json"),
    fetch("https://api.ipma.pt/open-data/distrits-islands.json"),
  ]);
  if (!seaRes.ok) throw new Error(`Sea forecast failed: ${seaRes.status}`);
  if (!stationsRes.ok) throw new Error(`Stations failed: ${stationsRes.status}`);

  const seaJson = await seaRes.json();
  const stationsJson = await stationsRes.json();
  const seaStations: SeaStation[] = seaJson.data ?? [];
  const weatherStations: IpmaStation[] = stationsJson.data ?? [];

  if (seaStations.length === 0) throw new Error("No sea stations returned");

  // Today in UTC (matches CURRENT_DATE on the server, since Supabase runs UTC)
  const today = new Date().toISOString().slice(0, 10);

  let updated = 0;
  let skipped = 0;

  for (const ws of weatherStations) {
    const wsLat = parseFloat(ws.latitude);
    const wsLon = parseFloat(ws.longitude);
    if (Number.isNaN(wsLat) || Number.isNaN(wsLon)) {
      skipped++;
      continue;
    }

    let nearest: SeaStation | null = null;
    let minDist = Infinity;
    for (const ss of seaStations) {
      const d = haversine(wsLat, wsLon, ss.latitude, ss.longitude);
      if (d < minDist) {
        minDist = d;
        nearest = ss;
      }
    }
    if (!nearest) {
      skipped++;
      continue;
    }

    const temp_agua = avg(parseFloat(nearest.sstMin ?? ""), parseFloat(nearest.sstMax ?? ""));
    const ondulacao_altura = nearest.waveHighMax != null ? parseFloat(nearest.waveHighMax) : null;

    const { error } = await supabase
      .from("meteo_diario")
      .update({ temp_agua, ondulacao_altura })
      .eq("ipma_global_id", ws.globalIdLocal)
      .eq("data", today);

    if (error) {
      console.error(`Update failed for station ${ws.globalIdLocal}:`, error.message);
      continue;
    }
    updated++;
  }

  console.log(`mar-e-temperatura: updated ${updated}/${weatherStations.length} stations for ${today} (skipped ${skipped})`);
  return new Response(
    JSON.stringify({ ok: true, updated, total: weatherStations.length, date: today }),
    { headers: { "Content-Type": "application/json" } },
  );
});

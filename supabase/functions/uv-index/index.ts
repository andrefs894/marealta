// IPMA UV index → fills uv_index on meteo_diario rows.
// Ported from n8n/workflows/uv-index.json. Runs at 00:10 and 12:10 UTC,
// after meteo-diario has created the rows.
//
// The IPMA UV endpoint returns multiple entries per (station, day) — we
// pick the daily maximum for each station-day pair, matching the
// behaviour of the previous n8n flow.
import { createServiceRoleClient } from "../_shared/supabase.ts";

interface IpmaUvEntry {
  globalIdLocal?: number;
  data?: string;
  iUv?: string;
}

Deno.serve(async () => {
  const supabase = createServiceRoleClient();

  const res = await fetch("https://api.ipma.pt/open-data/forecast/meteorology/uv/uv.json");
  if (!res.ok) throw new Error(`UV fetch failed: ${res.status}`);

  // uv.json returns a top-level array (not wrapped in {data:[]} like the others)
  const entries: IpmaUvEntry[] = await res.json();
  console.log(`uv-index: ${entries.length} entries received`);

  const maxUV = new Map<string, { ipma_global_id: number; data: string; uv: number }>();
  for (const e of entries) {
    if (!e.globalIdLocal || !e.data) continue;
    const uv = parseFloat(e.iUv ?? "");
    if (Number.isNaN(uv)) continue;
    const key = `${e.globalIdLocal}_${e.data}`;
    const existing = maxUV.get(key);
    if (!existing || uv > existing.uv) {
      maxUV.set(key, {
        ipma_global_id: e.globalIdLocal,
        data: e.data,
        uv: Math.round(uv),
      });
    }
  }

  const rows = [...maxUV.values()];
  if (rows.length === 0) {
    throw new Error("No UV data produced — check iUv field in uv.json");
  }

  let updated = 0;
  for (const r of rows) {
    const { error } = await supabase
      .from("meteo_diario")
      .update({ uv_index: r.uv })
      .eq("ipma_global_id", r.ipma_global_id)
      .eq("data", r.data);
    if (error) {
      console.error(`UV update failed for ${r.ipma_global_id}/${r.data}:`, error.message);
      continue;
    }
    updated++;
  }

  console.log(`uv-index: updated ${updated}/${rows.length} station-day pairs`);
  return new Response(
    JSON.stringify({ ok: true, updated, total: rows.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});

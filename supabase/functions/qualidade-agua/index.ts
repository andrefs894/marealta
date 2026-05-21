// EEA WISE bathing-water status → qualidade_agua. The EEA publishes Member
// States' annual assessments once per year (Portugal: typically autumn).
// This function pulls Portugal's classifications for the current season and
// upserts one row per beach, joined to `praias` via `codigo_agua_balnear`.
//
// Runs annually via pg_cron (October 1st, 09:00 UTC) — see
// supabase/migrations/*_setup_qualidade_agua_cron.sql.
//
// Ported from n8n/workflows/qualidade-agua.json so the ingest can run in the
// cloud without the local n8n container being up at the right moment.
import { createServiceRoleClient } from "../_shared/supabase.ts";

// EEA quality labels → our Portuguese DB enum
const QUALITY: Record<string, string> = {
  "1 - Excellent": "excelente",
  "2 - Good": "boa",
  "3 - Good or Sufficient": "aceitavel",
  "4 - Poor": "ma",
};

// Which season to pull. EEA season = calendar year of the bathing season just
// ended. Assessments for season N are published late in year N (or early N+1),
// so by Oct 1st of N+1 the season-N data is reliably available.
function targetSeason(now = new Date()): number {
  // Pull the most recently completed season. Before Oct, that's two years
  // back (EEA may not yet have published last summer); from Oct onward, last
  // summer's data is the freshest available.
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 9 ? y - 1 : y - 2;
}

interface EEARow {
  bathingWaterIdentifier: string;
  quality: string;
  season?: number | string;
}

interface QualidadeAguaUpsert {
  praia_id: number;
  classificacao: string;
  data_analise: string;       // YYYY-MM-DD
  updated_at: string;
}

Deno.serve(async () => {
  try {
    const supabase = createServiceRoleClient();
    const season = targetSeason();

    // 1. Fetch Portugal's classifications for the target season from EEA WISE
    const sql =
      `SELECT bathingWaterIdentifier, quality, season ` +
      `FROM WISE_BWD.latest.assessment_BathingWaterStatus ` +
      `WHERE CountryCode='PT' AND season=${season}`;
    const url =
      `https://discodata.eea.europa.eu/sql?query=${encodeURIComponent(sql)}&p=1&nrOfHits=2000`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`EEA WISE returned ${r.status}`);
    const body = await r.json() as { results?: EEARow[] };
    const results = body.results ?? [];
    console.log(`qualidade-agua: EEA returned ${results.length} PT rows for season ${season}`);

    const classified = results.filter((row) => QUALITY[row.quality]);
    console.log(`qualidade-agua: ${classified.length} rows with a known classification`);
    if (classified.length === 0) {
      // Don't fail loudly — the season may not be published yet. Surface in logs.
      return new Response(
        JSON.stringify({ ok: true, season, rows: 0, note: "no classifications yet" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Resolve codigo_agua_balnear → praia_id. The set fits comfortably in memory.
    const codigos = [...new Set(classified.map((r) => r.bathingWaterIdentifier))];
    const { data: praias, error: praiasErr } = await supabase
      .from("praias")
      .select("id, codigo_agua_balnear")
      .in("codigo_agua_balnear", codigos);
    if (praiasErr) throw new Error(`Failed to load praias: ${praiasErr.message}`);

    const idByCodigo = new Map<string, number>();
    for (const p of praias ?? []) {
      if (p.codigo_agua_balnear) idByCodigo.set(p.codigo_agua_balnear, p.id);
    }
    console.log(`qualidade-agua: matched ${idByCodigo.size}/${codigos.length} codes to beaches`);

    // 3. Build upsert rows. data_analise uses July 1 of the season (mid-bathing-season).
    const now = new Date().toISOString();
    const rows: QualidadeAguaUpsert[] = [];
    let unmatched = 0;
    for (const r of classified) {
      const praiaId = idByCodigo.get(r.bathingWaterIdentifier);
      if (!praiaId) { unmatched++; continue; }
      rows.push({
        praia_id: praiaId,
        classificacao: QUALITY[r.quality],
        data_analise: `${r.season ?? season}-07-01`,
        updated_at: now,
      });
    }
    if (unmatched > 0) {
      console.warn(`qualidade-agua: ${unmatched} EEA codes have no matching beach (codigo_agua_balnear)`);
    }

    // 4. Upsert by praia_id. Migration ensures (praia_id) is unique.
    const { error: upsertErr } = await supabase
      .from("qualidade_agua")
      .upsert(rows, { onConflict: "praia_id" });
    if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

    // 5. Delete rows whose praia_id is no longer classified by EEA for the
    //    current season. Without this, beaches that lose their "Excellent/Good/..."
    //    rating (now "Not classified" in EEA) keep showing stale data from a
    //    previous import. We only run delete after a successful upsert.
    const keepIds = rows.map((r) => r.praia_id);
    const { count: pruned, error: delErr } = await supabase
      .from("qualidade_agua")
      .delete({ count: "exact" })
      .not("praia_id", "in", `(${keepIds.join(",")})`);
    if (delErr) throw new Error(`Stale row prune failed: ${delErr.message}`);

    console.log(`qualidade-agua: upserted ${rows.length}, pruned ${pruned ?? 0} stale rows for season ${season}`);
    return new Response(
      JSON.stringify({ ok: true, season, rows: rows.length, unmatched, pruned: pruned ?? 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error("qualidade-agua fatal:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeteoHoraria } from '../types'

// Returns the local Lisbon hour (0–23) for an ISO timestamp.
function lisbonHour(iso: string): number {
  const hh = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(new Date(iso))
  return parseInt(hh, 10)
}

// Fetches the next ~24 daytime+evening forecast rows for a beach.
// Rows in the dead 00:00–07:59 local window are skipped (no one needs beach
// weather while everyone's asleep), so a request at 23:00 jumps straight to
// 08:00 the next morning. We over-fetch from Supabase and filter client-side
// since the dead window depends on Lisbon local time, not UTC.
export function useMeteoHoraria(praiaId: number | null) {
  const [horas, setHoras] = useState<MeteoHoraria[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (praiaId == null) {
      setLoading(false)
      return
    }

    async function carregar() {
      const desde = new Date()
      desde.setMinutes(0, 0, 0)

      // Fetch enough rows to survive the 00:00–08:00 dead window twice
      // (worst case: now is 23:00 → next 8h is dead → still want 24 useful).
      const { data, error } = await supabase
        .from('meteo_horaria')
        .select('*')
        .eq('praia_id', praiaId)
        .gte('hora_utc', desde.toISOString())
        .order('hora_utc', { ascending: true })
        .limit(40)

      if (error) {
        setErro(error.message)
        setLoading(false)
        return
      }

      const visiveis = (data ?? [])
        .filter(h => {
          const hr = lisbonHour(h.hora_utc)
          return hr >= 8 // skip 00:00 through 07:59 local
        })
        .slice(0, 24)

      setHoras(visiveis)
      setLoading(false)
    }

    carregar()
  }, [praiaId])

  return { horas, loading, erro }
}

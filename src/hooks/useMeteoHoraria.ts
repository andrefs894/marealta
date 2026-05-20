import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeteoHoraria } from '../types'
import { isNoiteLisboa } from '../lib/utils'

const DAYLIGHT_HOURS_TARGET = 24 // ~ 2 days of daylight content

// Fetches the next N daylight hours for a beach, rolling across days as
// needed. After today's sunset the strip jumps to tomorrow's first
// daylight hour, then continues into the day after, up to the limit.
// Night hours (00:00–sunrise + sunset–24:00) are skipped entirely.
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

      // Over-fetch generously — in winter (10 daylight hours/day) we need
      // ~2.4 days × 24 = ~58 raw rows to surface 24 daylight ones. The
      // Open-Meteo ingest stores 5 days × 24 = 120 hours, so we have headroom.
      const { data, error } = await supabase
        .from('meteo_horaria')
        .select('*')
        .eq('praia_id', praiaId)
        .gte('hora_utc', desde.toISOString())
        .order('hora_utc', { ascending: true })
        .limit(80)

      if (error) {
        setErro(error.message)
        setLoading(false)
        return
      }

      const visiveis = (data ?? [])
        .filter(h => !isNoiteLisboa(h.hora_utc))
        .slice(0, DAYLIGHT_HOURS_TARGET)

      setHoras(visiveis)
      setLoading(false)
    }

    carregar()
  }, [praiaId])

  return { horas, loading, erro }
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeteoHoraria } from '../types'
import { isNoiteLisboa } from '../lib/utils'

// Returns the local Lisbon date (YYYY-MM-DD) for an ISO timestamp.
function lisbonDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Lisbon',
  }).format(typeof iso === 'string' ? new Date(iso) : iso)
}

// Fetches the remaining daylight hours of TODAY (Lisbon time) for a beach.
// Strict interpretation: the strip empties out after sunset and stays empty
// until the next morning's ingest — the section auto-hides via the empty
// state check in PrevisaoHoraria.
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
      const hoje = lisbonDate(new Date())

      const { data, error } = await supabase
        .from('meteo_horaria')
        .select('*')
        .eq('praia_id', praiaId)
        .gte('hora_utc', desde.toISOString())
        .order('hora_utc', { ascending: true })
        .limit(24)

      if (error) {
        setErro(error.message)
        setLoading(false)
        return
      }

      // Keep only rows whose local Lisbon date is today AND that fall in the
      // daylight window. The daylight check makes the strip stop at sunset
      // (sun-icon rows only — evening twilight is excluded).
      const visiveis = (data ?? []).filter(h =>
        lisbonDate(h.hora_utc) === hoje && !isNoiteLisboa(h.hora_utc)
      )

      setHoras(visiveis)
      setLoading(false)
    }

    carregar()
  }, [praiaId])

  return { horas, loading, erro }
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeteoHoraria } from '../types'

// Fetches the next 24 hourly forecast rows for a beach from meteo_horaria.
// The Edge Function refreshes this table hourly; rows already in the past
// (relative to the request time) are filtered out so the UI always shows
// "what's coming up".
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
      // Round down to the current hour so the in-progress hour is still
      // returned (Open-Meteo's row for hour X covers X:00–X:59).
      const desde = new Date()
      desde.setMinutes(0, 0, 0)

      const { data, error } = await supabase
        .from('meteo_horaria')
        .select('*')
        .eq('praia_id', praiaId)
        .gte('hora_utc', desde.toISOString())
        .order('hora_utc', { ascending: true })
        .limit(24)

      if (error) setErro(error.message)
      else setHoras(data ?? [])
      setLoading(false)
    }

    carregar()
  }, [praiaId])

  return { horas, loading, erro }
}

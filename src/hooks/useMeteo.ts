import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeteoDiario } from '../types'
import { dataHoje } from '../lib/utils'

// Fetches today's per-beach daily aggregate from the meteo_diario view.
// The view aggregates meteo_horaria (hourly Open-Meteo data) into one row
// per (praia_id, data).
export function useMeteo(praiaId: number | null) {
  const [meteo, setMeteo] = useState<MeteoDiario | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (praiaId == null) {
      setLoading(false)
      return
    }

    async function carregar() {
      const { data, error } = await supabase
        .from('meteo_diario')
        .select('*')
        .eq('praia_id', praiaId)
        .eq('data', dataHoje())
        .maybeSingle()

      if (error) {
        setErro(error.message)
      } else {
        setMeteo(data)
      }
      setLoading(false)
    }

    carregar()
  }, [praiaId])

  return { meteo, loading, erro }
}

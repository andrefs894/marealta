import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Praia, MeteoDiario, MeteoHoraria, QualidadeAgua, PraiaComMeteo } from '../types'
import { dataHoje, haversineKm, estimarMinutos } from '../lib/utils'
import { estimarOcupacao } from '../lib/ocupacao'

function horaAtual() { return new Date().getHours() }
function diaSemanaAtual() { return new Date().getDay() } // 0=Sunday … 6=Saturday

export function usePraiaComMeteo(userLat: number | null, userLng: number | null) {
  const [praias, setPraias] = useState<Praia[]>([])
  const [meteo, setMeteo] = useState<MeteoDiario[]>([])
  const [meteoAgora, setMeteoAgora] = useState<MeteoHoraria[]>([])
  const [qualidades, setQualidades] = useState<QualidadeAgua[]>([])
  const [ocupacoes, setOcupacoes] = useState<{ praia_id: number; nivel_ocupacao: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      // Bounds for the current hour, used to pull one meteo_horaria row per beach.
      const desde = new Date(); desde.setMinutes(0, 0, 0)
      const ate = new Date(desde.getTime() + 3600000)

      const [praiasRes, meteoRes, agoraRes, qualRes, ocupacaoRes] = await Promise.all([
        supabase.from('praias').select('*'),
        supabase.from('meteo_diario').select('*').eq('data', dataHoje()),
        supabase.from('meteo_horaria').select('*')
          .gte('hora_utc', desde.toISOString())
          .lt('hora_utc', ate.toISOString()),
        supabase.from('qualidade_agua').select('*'),
        supabase
          .from('ocupacao_horaria')
          .select('praia_id, nivel_ocupacao')
          .eq('dia_semana', diaSemanaAtual())
          .eq('hora', horaAtual()),
      ])

      if (praiasRes.error) { setErro(praiasRes.error.message); setLoading(false); return }
      if (meteoRes.error)  { setErro(meteoRes.error.message);  setLoading(false); return }

      setPraias(praiasRes.data ?? [])
      setMeteo(meteoRes.data ?? [])
      setMeteoAgora(agoraRes.data ?? [])
      setQualidades(qualRes.data ?? [])
      setOcupacoes(ocupacaoRes.data ?? [])
      setLoading(false)
    }

    carregar()
  }, [])

  // Join beaches with today's weather, water quality, crowd level, and distance from user location.
  const praiaComMeteo = useMemo((): PraiaComMeteo[] => {
    const meteoMap     = new Map(meteo.map(m => [m.praia_id, m]))
    const agoraMap     = new Map(meteoAgora.map(m => [m.praia_id, m]))
    const qualidadeMap = new Map(qualidades.map(q => [q.praia_id, q]))
    const ocupacaoMap  = new Map(ocupacoes.map(o => [o.praia_id, o.nivel_ocupacao]))

    return praias.map(p => {
      const meteoP = meteoMap.get(p.id)
      // Prefer real DB data (ocupacao_horaria override) when present; fall back to heuristic estimator.
      const real = ocupacaoMap.get(p.id)
      const ocupacao_atual = real ?? estimarOcupacao(p, meteoP).nivel
      const ocupacao_fonte: 'tempo_real' | 'estimativa' = real != null ? 'tempo_real' : 'estimativa'
      return {
        ...p,
        meteo:          meteoP,
        meteoAgora:     agoraMap.get(p.id),
        qualidade_agua: qualidadeMap.get(p.id),
        ocupacao_atual,
        ocupacao_fonte,
        distancia_minutos:
          userLat != null && userLng != null && p.latitude != null && p.longitude != null
            ? estimarMinutos(userLat, userLng, p.latitude, p.longitude)
            : undefined,
        distancia_km:
          userLat != null && userLng != null && p.latitude != null && p.longitude != null
            ? Math.round(haversineKm(userLat, userLng, p.latitude, p.longitude))
            : undefined,
      }
    })
  }, [praias, meteo, meteoAgora, qualidades, ocupacoes, userLat, userLng])

  return { praiaComMeteo, loading, erro }
}

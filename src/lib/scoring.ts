// Scoring algorithm: takes a beach with weather data + user profile → returns a 0–100 score.
// Each dimension is scored 0–100 and then multiplied by its weight.
// Weights shift based on the user's profile type.

import type { PraiaComMeteo, PerfilUtilizador, TipoPerfil } from '../types'

type Pesos = {
  temperatura: number
  vento: number
  multidao: number
  distancia: number
  perfil: number
}

// Base weights per profile type (must sum to 1)
const PESOS_POR_PERFIL: Record<TipoPerfil, Pesos> = {
  familia:   { temperatura: 0.30, vento: 0.20, multidao: 0.20, distancia: 0.15, perfil: 0.15 },
  tranquila: { temperatura: 0.25, vento: 0.15, multidao: 0.35, distancia: 0.10, perfil: 0.15 },
  surf:      { temperatura: 0.15, vento: 0.30, multidao: 0.10, distancia: 0.20, perfil: 0.25 },
  social:    { temperatura: 0.25, vento: 0.15, multidao: 0.15, distancia: 0.20, perfil: 0.25 },
}

const PESOS_PADRAO: Pesos = { temperatura: 0.25, vento: 0.20, multidao: 0.25, distancia: 0.15, perfil: 0.15 }

// Score temperature: ideal range 24–30°C
function scorarTemperatura(tempMax: number | null | undefined): number {
  if (tempMax == null) return 50
  if (tempMax >= 24 && tempMax <= 30) return 100
  if (tempMax >= 20 && tempMax < 24) return 70
  if (tempMax > 30 && tempMax <= 35) return 80
  if (tempMax < 20) return Math.max(0, 50 - (20 - tempMax) * 5)
  return 50
}

// Score wind: lower intensity is generally better (except for surfers)
function scorarVento(intensidade: number | null | undefined, perfil: TipoPerfil | null): number {
  if (intensidade == null) return 50
  if (perfil === 'surf') {
    // Surfers want moderate to strong wind (classes 3–5)
    if (intensidade >= 3 && intensidade <= 5) return 100
    if (intensidade === 2 || intensidade === 6) return 70
    return 40
  }
  // Everyone else wants calm or light wind
  if (intensidade <= 1) return 100
  if (intensidade === 2) return 80
  if (intensidade === 3) return 55
  if (intensidade === 4) return 30
  return 10
}

// Score crowd level from Google Popular Times busyness index (0–100).
// Lower busyness = higher score (less crowd is better for most profiles).
// Falls back to neutral 50 when no data is available.
function scorarMultidao(praia: PraiaComMeteo): number {
  if (praia.ocupacao_atual == null) return 50
  return 100 - praia.ocupacao_atual
}

// Score distance relative to the user's chosen radius. The radius already
// hard-filters beaches in PaginaHoje; this scoring keeps a soft preference
// for closer beaches *within* the chosen range, scaled by where in the
// range the beach sits. Without scaling, a 20 km beach beats a 100 km one
// even when the user explicitly extended the search to 200 km — which
// makes the radius pill feel broken.
function scorarDistancia(km: number | undefined, maxKm: number | null): number {
  if (km == null) return 50
  if (maxKm == null || maxKm <= 0) {
    // No max preference: fall back to absolute bands so the score still
    // exists but doesn't depend on a radius the user never set.
    if (km <= 25)  return 100
    if (km <= 50)  return 85
    if (km <= 100) return 60
    return 30
  }
  if (km > maxKm) return 0 // defensive — should be filtered upstream
  const ratio = km / maxKm
  if (ratio <= 0.25) return 100
  if (ratio <= 0.50) return 85
  if (ratio <= 0.75) return 65
  return 45
}

// Score profile match: extra points when beach features match the profile
function scorarPerfil(praia: PraiaComMeteo, perfil: TipoPerfil | null): number {
  if (!perfil) return 50
  switch (perfil) {
    case 'familia':
      return (praia.nadador_salvador ? 30 : 0) +
             (praia.acessivel ? 20 : 0) +
             (praia.restaurante ? 20 : 0) +
             (praia.bandeira_azul ? 30 : 0)
    case 'tranquila':
      // Prefer river/lake beaches (quieter) and small/no parking
      return (praia.tipo === 'fluvial' || praia.tipo === 'albufeira' ? 40 : 20) +
             (praia.nadador_salvador ? 20 : 0) +
             (praia.bandeira_azul ? 40 : 0)
    case 'surf':
      // Surf = coastal with waves; lifeguard and water quality matter
      return (praia.tipo === 'costeira' ? 50 : 0) +
             (praia.nadador_salvador ? 25 : 0) +
             (praia.bandeira_azul ? 25 : 0)
    case 'social':
      return (praia.restaurante ? 35 : 0) +
             (praia.estacionamento !== 'inexistente' ? 30 : 0) +
             (praia.bandeira_azul ? 35 : 0)
  }
}

export function calcularScore(praia: PraiaComMeteo, perfil: PerfilUtilizador): number {
  const pesos = perfil.tipo ? PESOS_POR_PERFIL[perfil.tipo] : PESOS_PADRAO

  const s = {
    temperatura: scorarTemperatura(praia.meteo?.temp_max),
    vento:       scorarVento(praia.meteo?.vento_intensidade, perfil.tipo),
    multidao:    scorarMultidao(praia),
    distancia:   scorarDistancia(praia.distancia_km, perfil.distancia_maxima),
    perfil:      scorarPerfil(praia, perfil.tipo),
  }

  return Math.round(
    s.temperatura * pesos.temperatura +
    s.vento       * pesos.vento       +
    s.multidao    * pesos.multidao    +
    s.distancia   * pesos.distancia   +
    s.perfil      * pesos.perfil
  )
}

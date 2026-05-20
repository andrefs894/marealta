// Types for the Maré Alta domain model

export interface Praia {
  id: number
  nome: string
  concelho: string | null
  distrito: string | null
  latitude: number | null
  longitude: number | null
  tipo: 'costeira' | 'fluvial' | 'albufeira' | null
  bandeira_azul: boolean
  nadador_salvador: boolean
  acessivel: boolean
  restaurante: boolean
  estacionamento: 'gratuito' | 'pago' | 'inexistente' | null
  estacionamento_capacidade: number | null
  estacionamento_distancia_metros: number | null
  descricao: string | null
  ipma_global_id: number | null  // nearest IPMA weather station, assigned on import
  google_place_id: string | null
  google_rating: number | null         // 1.0–5.0
  google_review_count: number | null
  created_at: string
}

// Daily aggregate per beach, computed by the meteo_diario SQL view from
// meteo_horaria. Same name as the previous IPMA-keyed table so most
// frontend reads only had to change their join key (ipma_global_id → praia_id).
export interface MeteoDiario {
  praia_id: number
  data: string
  temp_min: number | null
  temp_max: number | null
  precipitacao: number | null            // mm/day total
  precipitacao_prob: number | null       // 0–100, peak hourly probability for the day
  vento_direcao: number | null           // degrees (Open-Meteo)
  vento_intensidade: number | null       // 0–9 Beaufort-like class (derived in the ingest function for scoring compat)
  uv_index: number | null
  estado_tempo: string | null
  temp_agua: number | null
  ondulacao_altura: number | null
  updated_at: string
}

// Hourly forecast per beach, sourced from Open-Meteo's Forecast + Marine APIs.
// 760 beaches × ~120 forecast hours ≈ 91K rows; refreshed in place every hour.
export interface MeteoHoraria {
  praia_id: number
  hora_utc: string                       // ISO timestamp (TIMESTAMPTZ)
  temp: number | null                    // °C at 2m
  precipitacao: number | null            // mm in that hour
  precipitacao_prob: number | null       // 0–100
  vento_velocidade: number | null        // km/h
  vento_direcao: number | null           // degrees
  vento_intensidade: number | null       // 0–9 class
  vento_rajada: number | null            // km/h gust
  uv_index: number | null
  weather_code: number | null            // WMO code
  estado_tempo: string | null            // Portuguese label
  temp_agua: number | null               // sea-surface temp °C (null inland)
  ondulacao_altura: number | null        // significant wave height m (null inland)
  updated_at: string
}

export interface QualidadeAgua {
  id: number
  praia_id: number
  classificacao: 'excelente' | 'boa' | 'aceitavel' | 'ma' | null
  data_analise: string | null
  updated_at: string
}

// User profile collected during onboarding
export type TipoPerfil = 'familia' | 'tranquila' | 'surf' | 'social'
export type DistanciaMaxima = 25 | 50 | 100 | 200 | null // km; null = doesn't matter

export interface PerfilUtilizador {
  tipo: TipoPerfil | null
  localizacao: { lat: number; lng: number } | null
  municipio: string | null
  distancia_maxima: DistanciaMaxima
}

// A beach with its weather data joined, used by the scoring engine.
// `meteo` is the daily aggregate (temp range, daily peak UV/wind, sea avg)
// used by scoring + heuristic occupation. `meteoAgora` is the current-hour
// snapshot used for "right now" display fields (UV, wind, precip %).
export interface PraiaComMeteo extends Praia {
  meteo?: MeteoDiario
  meteoAgora?: MeteoHoraria
  qualidade_agua?: QualidadeAgua
  distancia_minutos?: number // estimated drive time from user location
  distancia_km?: number      // straight-line distance from user location
  ocupacao_atual?: number | null // 0–100 busyness; null = no data
  ocupacao_fonte?: 'estimativa' | 'tempo_real' | null
}

// Beach photo, sourced from Google Places Photos API.
// Attribution must be displayed alongside the photo per Google ToS.
export interface Foto {
  id: number
  praia_id: number
  url: string
  largura: number | null
  altura: number | null
  attribution: string | null  // e.g. "Photo by John Doe"
  ordem: number               // 0 = primary
  fonte: string | null        // 'google_places' | 'wikimedia' | ...
}

// Nearby restaurant / bar / cafe within ~500m of a beach.
// Refreshed monthly via n8n; ranked by rating × log(review_count).
export interface PontoInteresse {
  id: number
  praia_id: number
  google_place_id: string
  nome: string
  tipo: 'restaurante' | 'bar' | 'cafe' | string | null
  rating: number | null
  review_count: number | null
  foto_url: string | null
  foto_attr: string | null
  latitude: number | null
  longitude: number | null
  distancia_metros: number | null
  endereco: string | null
}

// Result from the scoring engine
export interface RecomendacaoResult {
  praia: PraiaComMeteo
  score: number
  motivo: string // short human-readable explanation e.g. "Temperatura ideal e vento fraco"
}

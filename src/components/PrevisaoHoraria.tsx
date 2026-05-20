import type { MeteoHoraria } from '../types'
import { iconeEstadoTempo } from '../lib/utils'

// Horizontal scrolling strip of hourly forecasts (next 24h) for a beach.
// Each cell shows the local hour, a weather icon, temperature, and a small
// drop if there's a non-trivial chance of rain. Mounts on FichaPraia.

const C = {
  navy: '#1E3A5F',
  navyDim: 'rgba(30,58,95,0.55)',
  navySoft: 'rgba(30,58,95,0.06)',
  rain: '#4FA8E0',
  white: '#FFFFFF',
} as const

interface Props {
  horas: MeteoHoraria[]
}

// Format an ISO timestamp as a 2-digit Europe/Lisbon hour like "14h".
function formatarHora(iso: string): string {
  const d = new Date(iso)
  const hh = new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(d)
  // Intl returns "14" — strip any extra and append "h"
  return `${hh.padStart(2, '0').slice(0, 2)}h`
}

export default function PrevisaoHoraria({ horas }: Props) {
  if (horas.length === 0) return null

  return (
    <div style={{
      background: C.white,
      borderRadius: 16,
      padding: '14px 0 16px',
      boxShadow: '0 1px 3px rgba(30,58,95,0.06)',
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.navyDim,
        letterSpacing: '2.5px', textTransform: 'uppercase',
        margin: '0 18px 12px', padding: 0,
      }}>
        Próximas horas
      </p>

      <div
        role="list"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '0 18px 4px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
        // Hide scrollbar on webkit too
        className="previsao-horaria-strip"
      >
        {horas.map((h, idx) => {
          const isAgora = idx === 0
          const choverá = (h.precipitacao_prob ?? 0) >= 30 || (h.precipitacao ?? 0) > 0.1
          return (
            <div
              key={h.hora_utc}
              role="listitem"
              style={{
                flex: '0 0 auto',
                width: 56,
                background: isAgora ? C.navy : C.navySoft,
                color: isAgora ? C.white : C.navy,
                borderRadius: 14,
                padding: '10px 4px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                opacity: isAgora ? 0.9 : 0.7,
                fontFeatureSettings: '"tnum"',
              }}>
                {isAgora ? 'Agora' : formatarHora(h.hora_utc)}
              </span>

              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30 }} aria-hidden>
                {iconeEstadoTempo(h.estado_tempo, h.precipitacao, 30)}
              </span>

              <span style={{
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1,
                fontFeatureSettings: '"tnum"',
              }}>
                {h.temp != null ? `${Math.round(h.temp)}°` : '—'}
              </span>

              <span style={{
                fontSize: 10,
                color: choverá ? C.rain : 'transparent',
                lineHeight: 1,
                fontFeatureSettings: '"tnum"',
                minHeight: 12,
              }}>
                {choverá && h.precipitacao_prob != null ? `${h.precipitacao_prob}%` : ''}
              </span>
            </div>
          )
        })}
      </div>

      <style>{`
        .previsao-horaria-strip::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { MeteoHoraria } from '../types'
import { iconeEstadoTempo, isNoiteLisboa } from '../lib/utils'

// Horizontal scrolling strip of hourly forecasts (next ~24 daylight/evening
// hours) for a beach. Mounts on FichaPraia. Touch users swipe; desktop users
// get the floating arrow buttons.

const C = {
  navy: '#1E3A5F',
  navyDim: 'rgba(30,58,95,0.55)',
  navySoft: 'rgba(30,58,95,0.06)',
  rain: '#4FA8E0',
  white: '#FFFFFF',
} as const

const CELL_W = 56
const CELL_GAP = 6
const SCROLL_BY = (CELL_W + CELL_GAP) * 3 // ~3 cells per arrow click

interface Props {
  horas: MeteoHoraria[]
}

function formatarHora(iso: string): string {
  const hh = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Europe/Lisbon',
  }).format(new Date(iso))
  return `${hh.padStart(2, '0').slice(0, 2)}h`
}

export default function PrevisaoHoraria({ horas }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [podeEsquerda, setPodeEsquerda] = useState(false)
  const [podeDireita, setPodeDireita] = useState(false)

  // Current UTC hour expressed as an integer (hours since epoch). Used to
  // decide which cell wears the "Agora" highlight. Ticked at the start of
  // each hour by the effect below so the highlight rolls forward without
  // needing a page refresh.
  const [horaAgora, setHoraAgora] = useState(() => Math.floor(Date.now() / 3600000))
  useEffect(() => {
    const msToNextHour = 3600000 - (Date.now() % 3600000) + 500
    const t = setTimeout(() => {
      setHoraAgora(Math.floor(Date.now() / 3600000))
    }, msToNextHour)
    return () => clearTimeout(t)
  }, [horaAgora])

  // Recompute arrow visibility on scroll, on mount, and whenever horas changes.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function update() {
      if (!el) return
      setPodeEsquerda(el.scrollLeft > 2)
      setPodeDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [horas])

  function scrollDir(dir: -1 | 1) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * SCROLL_BY, behavior: 'smooth' })
  }

  if (horas.length === 0) return null

  return (
    <div style={{
      background: C.white,
      borderRadius: 16,
      padding: '14px 0 16px',
      boxShadow: '0 1px 3px rgba(30,58,95,0.06)',
      position: 'relative',
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.navyDim,
        letterSpacing: '2.5px', textTransform: 'uppercase',
        margin: '0 18px 12px', padding: 0,
      }}>
        Próximas horas
      </p>

      <div
        ref={scrollRef}
        role="list"
        style={{
          display: 'flex',
          gap: CELL_GAP,
          overflowX: 'auto',
          padding: '0 18px 4px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
        className="previsao-horaria-strip"
      >
        {horas.map((h) => {
          // "Agora" matches exactly one row — the row whose UTC hour matches
          // the current UTC hour. Comparing floored hours (not within-1h)
          // avoids the bug where two consecutive rows both matched when
          // "now" sat between two hour ticks. horaAgora is captured at the
          // top of the function so the comparison is consistent across cells.
          const isAgora = Math.floor(new Date(h.hora_utc).getTime() / 3600000) === horaAgora
          const noite = isNoiteLisboa(h.hora_utc)
          const choverá = (h.precipitacao_prob ?? 0) >= 30 || (h.precipitacao ?? 0) > 0.1
          return (
            <div
              key={h.hora_utc}
              role="listitem"
              style={{
                flex: '0 0 auto',
                width: CELL_W,
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
                {iconeEstadoTempo(h.estado_tempo, h.precipitacao, 30, noite)}
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

      {/* Desktop scroll arrows. Auto-hide at edges; harmless (just decorative) on touch. */}
      <ArrowButton
        side="left"
        visible={podeEsquerda}
        onClick={() => scrollDir(-1)}
      />
      <ArrowButton
        side="right"
        visible={podeDireita}
        onClick={() => scrollDir(1)}
      />

      <style>{`
        .previsao-horaria-strip::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}

function ArrowButton({ side, visible, onClick }: { side: 'left' | 'right'; visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Voltar' : 'Avançar'}
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '50%',
        [side]: 6,
        transform: 'translateY(-10%)',
        width: 30,
        height: 30,
        borderRadius: '50%',
        border: 'none',
        background: C.white,
        boxShadow: '0 2px 8px rgba(30,58,95,0.18)',
        display: visible ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        color: C.navy,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {side === 'left'
          ? <polyline points="15 18 9 12 15 6" />
          : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  )
}

import { useOutletContext, Link } from 'react-router-dom'
import Header from '../components/Header'
import { useFavoritas } from '../hooks/useFavoritas'
import { iconeEstadoTempo } from '../lib/utils'
import type { ContextoApp } from '../App'
import type { PraiaComMeteo } from '../types'

const C = {
  navy: '#1E3A5F',
  cream: '#EDE3CD',
  white: '#FFFFFF',
  navyDim: 'rgba(30,58,95,0.55)',
  navySoft: 'rgba(30,58,95,0.08)',
} as const


function CartaoFavorita({
  praia,
  onRemover,
}: {
  praia: PraiaComMeteo
  onRemover: () => void
}) {
  const m = praia.meteo

  return (
    <div style={{
      background: C.white, borderRadius: 12, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 1px 3px rgba(30,58,95,0.06)',
    }}>
      <Link
        to={`/praia/${praia.id}`}
        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, textDecoration: 'none', minWidth: 0 }}
      >
        <div style={{
          width: 40, height: 40, background: C.navySoft, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.navy, flexShrink: 0,
        }}>
          {iconeEstadoTempo(m?.estado_tempo, m?.precipitacao, 20)}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{
            fontSize: 15, fontWeight: 500, color: C.navy, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {praia.nome}
          </p>
          <p style={{
            fontSize: 12, color: C.navyDim, margin: '3px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {[praia.concelho,
              m?.temp_max != null ? `${m.temp_max}°C` : null,
              praia.distancia_minutos != null ? `~${praia.distancia_minutos} min` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
      </Link>

      {/* Unfavorite — filled navy heart */}
      <button
        onClick={onRemover}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
        aria-label="Remover dos favoritos"
      >
        <svg width="22" height="22" viewBox="0 0 24 24"
          fill={C.navy} stroke={C.navy}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    </div>
  )
}

export default function PaginaFavoritas() {
  const { praiaComMeteo } = useOutletContext<ContextoApp>()
  const { favoritas, toggleFavorita } = useFavoritas()

  const praiasGravadas = praiaComMeteo.filter(p => favoritas.includes(p.id))

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ maxWidth: 420, margin: '0 auto', background: C.cream, minHeight: '100vh', position: 'relative', paddingBottom: 90 }}>
        <Header />

        <div style={{ padding: '24px 20px 4px' }}>
          <h1 style={{
            fontSize: 34, fontWeight: 500,
            color: C.navy, margin: 0, letterSpacing: '-0.5px', lineHeight: 1,
          }}>
            Favoritas
          </h1>
          {praiasGravadas.length > 0 && (
            <p style={{
              fontSize: 11, fontWeight: 600, color: C.navyDim,
              letterSpacing: '2px', textTransform: 'uppercase', margin: '10px 0 0',
            }}>
              {praiasGravadas.length} {praiasGravadas.length === 1 ? 'praia guardada' : 'praias guardadas'}
            </p>
          )}
        </div>

        <div style={{ padding: '20px 20px 0' }}>
          {praiasGravadas.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <p style={{ fontSize: 48, margin: '0 0 16px' }}>❤️</p>
              <p style={{ fontSize: 15, color: C.navy, margin: '0 0 8px', fontWeight: 500 }}>
                Ainda não tens praias favoritas
              </p>
              <p style={{ fontSize: 13, color: C.navyDim, margin: 0, lineHeight: 1.5 }}>
                Adiciona praias tocando no ❤️ na recomendação ou na ficha de qualquer praia
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {praiasGravadas.map(p => (
                <CartaoFavorita
                  key={p.id}
                  praia={p}
                  onRemover={() => toggleFavorita(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

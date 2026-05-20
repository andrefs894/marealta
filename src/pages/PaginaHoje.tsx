import { useEffect, useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Mapa from '../components/Mapa'
import { useSeletorNavegacao } from '../components/SeletorNavegacao'
import { useAuth } from '../hooks/useAuth'
import { useRecomendacao } from '../hooks/useRecomendacao'
import { useFavoritas } from '../hooks/useFavoritas'
import { usePerfil } from '../hooks/usePerfil'
import { haversineKm, iconeEstadoTempo, labelQualidadeAgua, labelUV, labelVento, isNoiteAgora } from '../lib/utils'
import type { ContextoApp } from '../App'
import type { DistanciaMaxima, RecomendacaoResult } from '../types'

const C = {
  navy: '#1E3A5F',
  cream: '#EDE3CD',
  white: '#FFFFFF',
  creamText: '#F5EFE0',
  creamDim: 'rgba(245,239,224,0.65)',
  creamFaint: 'rgba(245,239,224,0.45)',
  navyDim: 'rgba(30,58,95,0.55)',
  navySoft: 'rgba(30,58,95,0.08)',
  pillBorder: 'rgba(30,58,95,0.25)',
  // Hero (on-navy) variants
  cardOnNavy: 'rgba(245,239,224,0.08)',
  cardBorderOnNavy: 'rgba(245,239,224,0.12)',
  pillBorderOnNavy: 'rgba(245,239,224,0.28)',
  ctaYellow: '#F4D58D',
} as const


export default function PaginaHoje() {
  const { praiaComMeteo, loading, erro, coordenadas } = useOutletContext<ContextoApp>()
  const { perfil, atualizar } = usePerfil()
  const { isFavorita, toggleFavorita } = useFavoritas()
  const { user } = useAuth()
  const radiusKm = perfil.distancia_maxima ?? 50

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor
    document.documentElement.style.backgroundColor = C.navy
    return () => { document.documentElement.style.backgroundColor = prev }
  }, [])

  const praiasNoRaio = useMemo(() => {
    if (!coordenadas) return praiaComMeteo
    return praiaComMeteo.filter(p => {
      if (p.latitude == null || p.longitude == null) return false
      return haversineKm(coordenadas.lat, coordenadas.lng, p.latitude, p.longitude) <= radiusKm
    })
  }, [praiaComMeteo, coordenadas, radiusKm])

  const recomendacoes = useRecomendacao(praiasNoRaio, perfil)
  const topRec = recomendacoes[0]
  const outrasOpcoes = recomendacoes.slice(1)

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
     <div style={{ maxWidth: 420, margin: '0 auto', background: C.cream, position: 'relative', minHeight: '100vh', paddingBottom: 90 }}>

      {/* HERO — navy, all primary recommendation content lives here.
          The wave-shaped bottom transition is rendered AFTER the CTA buttons. */}
      <section style={{
        background: C.navy,
        padding: '18px 20px 0',
        position: 'relative',
      }}>
        {/* Brand bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <p style={{ color: C.creamText, fontSize: 12, fontWeight: 600, letterSpacing: '2px', margin: 0 }}>
            MARÉ ALTA
          </p>
          <Link to="/perfil" aria-label="Perfil" style={{ display: 'flex' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: 28, height: 28, borderRadius: '50%', display: 'block', objectFit: 'cover' }} />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.creamDim} strokeWidth="1.8" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </Link>
        </div>

        {topRec ? (
          <Hero
            rec={topRec}
            isFavorita={isFavorita(topRec.praia.id)}
            onToggleFavorita={() => toggleFavorita(topRec.praia.id)}
          />
        ) : (
          <p style={{ color: C.creamDim, margin: '36px 0 75px', fontSize: 14 }}>
            {loading ? 'A calcular a melhor praia para hoje…' : 'Sem praias no raio selecionado.'}
          </p>
        )}

        {/* Wave-shaped transition — rendered as the last element so it sits
            below all hero content (name, weather, boxes, pills, buttons). */}
        <div style={{ position: 'relative', height: 65, marginTop: 24 }}>
          <svg
            aria-hidden
            style={{ position: 'absolute', bottom: -1, left: -20, width: 'calc(100% + 40px)', height: 65, display: 'block' }}
            viewBox="0 0 420 65" preserveAspectRatio="none"
          >
            <path d="M0,30 Q105,0 210,30 T420,30 L420,65 L0,65 Z" fill={C.cream} />
          </svg>
        </div>
      </section>

      {/* BODY — map + secondary options */}
      {topRec && (
        <section style={{
          padding: '24px 20px 0',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          {/* Map */}
          <div style={{ borderRadius: 16, overflow: 'hidden' }}>
            <Mapa
              praias={praiaComMeteo}
              recomendacoes={recomendacoes}
              coordenadas={coordenadas}
              radiusKm={radiusKm}
              onRadiusChange={(km) => atualizar({ distancia_maxima: km as DistanciaMaxima })}
            />
          </div>

          {/* Outras opções */}
          {outrasOpcoes.length > 0 && (
            <section style={{ marginBottom: 8 }}>
              <p style={{
                fontSize: 11, fontWeight: 600, color: C.navyDim,
                letterSpacing: '2.5px', textTransform: 'uppercase', margin: '0 0 12px',
              }}>
                Outras opções
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {outrasOpcoes.map(rec => <CartaoSecundario key={rec.praia.id} rec={rec} />)}
              </div>
            </section>
          )}
        </section>
      )}

      {erro && (
        <div style={{ padding: '24px 20px' }}>
          <p style={{ color: '#C04848', fontSize: 14, margin: 0 }}>Erro ao carregar: {erro}</p>
        </div>
      )}
     </div>
    </div>
  )
}

function Hero({ rec, isFavorita, onToggleFavorita }: {
  rec: RecomendacaoResult
  isFavorita: boolean
  onToggleFavorita: () => void
}) {
  const { praia } = rec
  const m = praia.meteo
  const { abrir: abrirNavegacao, sheet: sheetNavegacao } = useSeletorNavegacao()

  const localizacao = [
    praia.concelho || praia.distrito || null,
    praia.distancia_minutos != null ? `~${praia.distancia_minutos} min` : null,
  ].filter(Boolean).join(' · ')

  const temCoords = praia.latitude != null && praia.longitude != null

  return (
    <div style={{ marginTop: 26 }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.creamDim,
        letterSpacing: '2.5px', textTransform: 'uppercase', margin: '0 0 14px',
      }}>
        A sua recomendação para hoje
      </p>

      {/* Name + location + favourite (circular outlined button) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: 40, fontWeight: 500, lineHeight: 1.05,
            color: C.creamText, margin: 0, letterSpacing: '-0.5px',
          }}>
            {praia.nome}
          </h1>
          <p style={{
            fontSize: 13, color: C.creamDim, margin: '10px 0 0',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {localizacao}
          </p>
        </div>
        <button
          onClick={onToggleFavorita}
          style={{
            background: 'transparent',
            border: `1.5px solid ${C.pillBorderOnNavy}`,
            borderRadius: '50%',
            width: 40, height: 40,
            cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
          aria-label="Favorita"
        >
          <IcCoracao preenchido={isFavorita} />
        </button>
      </div>

      {/* Weather: left column = big icon + status text, right column = temp */}
      {m && (
        <div style={{
          display: 'flex', alignItems: 'stretch', gap: 0,
          marginTop: 28,
        }}>
          {/* Left — icon stacked above status label, fills its half */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end', gap: 10,
          }}>
            <span style={{ display: 'flex', lineHeight: 1, color: C.creamText }} aria-hidden>
              {iconeEstadoTempo(m.estado_tempo, m.precipitacao, 64, isNoiteAgora())}
            </span>
            <p style={{
              fontSize: 14, fontWeight: 400, color: C.creamDim,
              margin: 0, lineHeight: 1.2, textAlign: 'center',
            }}>
              {m.estado_tempo ?? '—'}
            </p>
          </div>

          {/* Divider */}
          <div style={{ width: 1, background: 'rgba(245,239,224,0.18)', margin: '0 16px', flexShrink: 0 }} />

          {/* Right — max temp + min temp, bottom-aligned */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end', gap: 6,
          }}>
            {m.temp_max != null && (
              <p style={{
                fontSize: 64, fontWeight: 300, color: C.creamText,
                margin: 0, lineHeight: 1, letterSpacing: '-2px',
              }}>
                {Math.round(m.temp_max)}°
              </p>
            )}
            {m.temp_min != null && (
              <p style={{
                fontSize: 13, fontWeight: 400, color: C.creamDim,
                margin: 0, lineHeight: 1,
                fontFeatureSettings: '"tnum"',
              }}>
                mín {Math.round(m.temp_min)}°
              </p>
            )}
          </div>
        </div>
      )}

      {/* 3 databoxes — wind / water quality / UV */}
      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <DataBox
          icone={<IcWind />}
          value={praia.meteoAgora?.vento_intensidade != null ? labelVento(praia.meteoAgora.vento_intensidade) : '—'}
          label="VENTO"
        />
        <DataBox
          icone={<IcDrop />}
          value={labelQualidadeAgua(praia.qualidade_agua?.classificacao)}
          label="ÁGUA"
        />
        <DataBox
          icone={<IcSun />}
          value={labelUV(praia.meteoAgora?.uv_index)}
          label="UV"
        />
      </div>

      {/* Service pills */}
      <Servicos praia={praia} />

      {/* CTA buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Link
          to={`/praia/${praia.id}`}
          style={{
            flex: 1,
            background: C.white,
            color: C.navy,
            padding: '13px 16px',
            borderRadius: 26,
            fontSize: 14, fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Ver detalhes
        </Link>
        {temCoords && (
          <button
            type="button"
            onClick={() => abrirNavegacao(praia.latitude, praia.longitude, praia.nome)}
            style={{
              flex: 1,
              background: 'transparent',
              color: C.creamText,
              border: `1.5px solid ${C.pillBorderOnNavy}`,
              padding: '11.5px 16px',
              borderRadius: 26,
              fontSize: 14, fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Como chegar
          </button>
        )}
      </div>
      {sheetNavegacao}
    </div>
  )
}

function DataBox({ icone, value, label }: { icone: React.ReactNode; value: string; label: string }) {
  return (
    <div style={{
      flex: 1,
      background: C.cardOnNavy,
      border: `1px solid ${C.cardBorderOnNavy}`,
      borderRadius: 16,
      padding: '14px 8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      minWidth: 0,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
        {icone}
      </span>
      <span style={{
        fontSize: 14, fontWeight: 500, color: C.creamText,
        lineHeight: 1.15, textAlign: 'center',
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value}
      </span>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: C.creamFaint, letterSpacing: '2px' }}>
        {label}
      </span>
    </div>
  )
}

function Servicos({ praia }: { praia: RecomendacaoResult['praia'] }) {
  const servicos: { icone: React.ReactNode; texto: string }[] = []
  if (praia.bandeira_azul)                  servicos.push({ icone: <IcFlag />,    texto: 'Bandeira Azul' })
  if (praia.nadador_salvador)               servicos.push({ icone: <IcLife />,    texto: 'Nadador-Salvador' })
  if (praia.acessivel)                      servicos.push({ icone: <IcAccess />,  texto: 'Acessível' })
  if (praia.estacionamento === 'gratuito')  servicos.push({ icone: <IcParking color="#5BC8F7" />, texto: 'Estac. grátis' })
  else if (praia.estacionamento === 'pago') servicos.push({ icone: <IcParking color="#5BC8F7" />, texto: 'Estac. pago' })
  if (praia.restaurante)                    servicos.push({ icone: <IcFork />,    texto: 'Restaurante' })

  if (servicos.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
      {servicos.map(s => <Pill key={s.texto} icone={s.icone} texto={s.texto} />)}
    </div>
  )
}

function Pill({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px',
      borderRadius: 20,
      border: `1px solid ${C.pillBorderOnNavy}`,
      background: 'transparent',
      color: C.creamText,
      fontSize: 12, fontWeight: 500,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>{icone}</span>
      {texto}
    </span>
  )
}

function IcCoracao({ preenchido }: { preenchido: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24"
      fill={preenchido ? C.creamText : 'none'}
      stroke={C.creamText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

// ── Line icons for the on-navy data boxes ──────────────────────────────
function IcWind() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.creamText} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h16a3 3 0 1 1-3 3" />
      <path d="M3 16h9" />
    </svg>
  )
}
function IcDrop() {
  return (
    <svg width="20" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.creamText} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5s7 7.5 7 12a7 7 0 1 1-14 0c0-4.5 7-12 7-12z" />
    </svg>
  )
}
function IcSun() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#F5C24D"
      stroke="#F5C24D" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
  )
}

// ── Service-pill icons (colored, like the screenshot) ──────────────────
function IcFlag() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#3B82F6" stroke="#3B82F6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H6v9" />
    </svg>
  )
}
function IcLife() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E05252" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="#E05252" />
      <line x1="5.5" y1="5.5" x2="9.5" y2="9.5" />
      <line x1="14.5" y1="14.5" x2="18.5" y2="18.5" />
      <line x1="18.5" y1="5.5" x2="14.5" y2="9.5" />
      <line x1="9.5" y1="14.5" x2="5.5" y2="18.5" />
    </svg>
  )
}
function IcAccess() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#3B82F6" stroke="#3B82F6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="5.5" r="1.4" fill="#fff" stroke="#fff" />
      <path d="M9 9.5h6M11 9.5v4l-2 4M13 13.5h2.5l1.5 4" stroke="#fff" strokeWidth="1.4" fill="none" />
    </svg>
  )
}
function IcParking({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M10 17V8h3.2a2.8 2.8 0 0 1 0 5.6H10" stroke="#fff" fill="none" strokeWidth="1.8" />
    </svg>
  )
}
function IcFork() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E89B3C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2v8a2 2 0 0 0 4 0V2M9 10v12" />
      <path d="M16 2c-1.5 0-3 2-3 5s1.5 5 3 5v10" />
    </svg>
  )
}

function CartaoSecundario({ rec }: { rec: RecomendacaoResult }) {
  const { praia } = rec
  const m = praia.meteo
  const subtitulo = [
    praia.concelho,
    m?.temp_max != null ? `${Math.round(m.temp_max)}°C` : null,
    praia.distancia_minutos != null ? `~${praia.distancia_minutos} min` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Link to={`/praia/${praia.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        background: C.white,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 1px 3px rgba(30,58,95,0.05)',
      }}>
        <div style={{
          width: 40, height: 40, background: C.navySoft, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.navy, flexShrink: 0,
        }}>
          {iconeEstadoTempo(m?.estado_tempo, m?.precipitacao, 20, isNoiteAgora())}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 15, fontWeight: 500, color: C.navy, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {praia.nome}
          </p>
          {subtitulo && (
            <p style={{
              fontSize: 12, color: C.navyDim, margin: '3px 0 0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {subtitulo}
            </p>
          )}
        </div>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke={C.navyDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  )
}

import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import type { Praia, MeteoDiario, QualidadeAgua } from '../types'
import type { ContextoApp } from '../App'
import { dataHoje, labelVento, iconeEstadoTempo, labelUV, estimarMinutos, isNoiteAgora } from '../lib/utils'
import { estimarOcupacao } from '../lib/ocupacao'
import IndicadorOcupacao from './IndicadorOcupacao'
import GaleriaFotos from './GaleriaFotos'
import PontosInteresse from './PontosInteresse'
import { useSeletorNavegacao } from './SeletorNavegacao'
import { useFavoritas } from '../hooks/useFavoritas'
import { useFotos } from '../hooks/useFotos'
import { usePontosInteresse } from '../hooks/usePontosInteresse'
import { useMeteoHoraria } from '../hooks/useMeteoHoraria'
import PrevisaoHoraria from './PrevisaoHoraria'

const PORTUGAL_BOUNDS: L.LatLngBoundsExpression = [[36.3, -10.0], [42.5, -5.8]]

const ICONE_PRAIA = L.divIcon({
  className: '',
  html: `<div class="marker-pulse" style="width:16px;height:16px;background:#FF8C00;border-radius:50%;border:2px solid rgba(255,140,0,0.3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const C = {
  navy: '#1E3A5F',
  cream: '#EDE3CD',
  white: '#FFFFFF',
  creamText: '#F5EFE0',
  creamDim: 'rgba(245,239,224,0.65)',
  navyDim: 'rgba(30,58,95,0.55)',
  navySoft: 'rgba(30,58,95,0.08)',
  pillBorder: 'rgba(30,58,95,0.25)',
} as const


function labelTipo(tipo: string | null): string {
  if (tipo === 'costeira') return 'Costeira'
  if (tipo === 'fluvial') return 'Fluvial'
  if (tipo === 'albufeira') return 'Albufeira'
  return ''
}

const QUALIDADE_LABEL: Record<string, string> = { excelente: 'Excelente', boa: 'Boa', aceitavel: 'Aceitável', ma: 'Má' }

function DataBox({ icone, value, label }: { icone: React.ReactNode; value: string; label: string }) {
  return (
    <div style={{
      flex: 1,
      background: C.navySoft,
      borderRadius: 16,
      padding: '14px 8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      minWidth: 0,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
        {icone}
      </span>
      <span style={{
        fontSize: 14, fontWeight: 500, color: C.navy,
        lineHeight: 1.15, textAlign: 'center',
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 9.5, fontWeight: 600, color: C.navyDim,
        letterSpacing: '2px', textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  )
}

// ── Line icons for the data boxes (navy on cream card) ─────────────────
function IcRain() {
  return (
    <svg width="20" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 13a5 5 0 0 0-1-9.9 6 6 0 0 0-11 3 5 5 0 0 0 1 9.9" />
      <line x1="8" y1="19" x2="8" y2="21" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="16" y1="19" x2="16" y2="21" />
    </svg>
  )
}
function IcWind() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h16a3 3 0 1 1-3 3" />
      <path d="M3 16h9" />
    </svg>
  )
}
function IcSun() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
function IcDrop() {
  return (
    <svg width="20" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5s7 7.5 7 12a7 7 0 1 1-14 0c0-4.5 7-12 7-12z" />
    </svg>
  )
}
function IcThermo() {
  return (
    <svg width="20" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  )
}
function IcWave() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={C.navy} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
      <path d="M2 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    </svg>
  )
}

function Skeleton() {
  return (
    <div style={{ minHeight: '100vh', background: C.navy }}>
      <div style={{ maxWidth: 420, margin: '0 auto', background: C.cream, minHeight: '100vh', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: C.navySoft, borderRadius: 16, height: 32, width: '60%' }} className="animate-pulse" />
        <div style={{ background: C.navySoft, borderRadius: 12, height: 140 }} className="animate-pulse" />
        <div style={{ background: C.navySoft, borderRadius: 12, height: 100 }} className="animate-pulse" />
      </div>
    </div>
  )
}

export default function FichaPraia() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { coordenadas } = useOutletContext<ContextoApp>()
  const { isFavorita, toggleFavorita } = useFavoritas()

  const [praia, setPraia] = useState<Praia | null>(null)
  const [meteo, setMeteo] = useState<MeteoDiario | null>(null)
  const [qualidade, setQualidade] = useState<QualidadeAgua | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const praiaId = id ? parseInt(id, 10) : NaN
    if (isNaN(praiaId)) { setErro('ID inválido'); setLoading(false); return }

    async function carregar() {
      const [praiaRes, qualRes] = await Promise.all([
        supabase.from('praias').select('*').eq('id', praiaId).single(),
        supabase.from('qualidade_agua').select('*').eq('praia_id', praiaId)
          .order('data_analise', { ascending: false }).limit(1).maybeSingle(),
      ])

      if (praiaRes.error) { setErro(praiaRes.error.message); setLoading(false); return }

      const p = praiaRes.data as Praia
      setPraia(p)
      setQualidade(qualRes.data ?? null)

      const meteoRes = await supabase.from('meteo_diario').select('*')
        .eq('praia_id', p.id).eq('data', dataHoje()).maybeSingle()
      setMeteo(meteoRes.data ?? null)

      setLoading(false)
    }

    carregar()
  }, [id])

  const { fotos } = useFotos(praia?.id ?? null)
  const { pontos } = usePontosInteresse(praia?.id ?? null)
  const { horas } = useMeteoHoraria(praia?.id ?? null)
  const { abrir: abrirNavegacao, sheet: sheetNavegacao } = useSeletorNavegacao()

  if (loading) return <Skeleton />

  if (erro || !praia) {
    return (
      <div style={{ minHeight: '100vh', background: C.navy }}>
        <div style={{ maxWidth: 420, margin: '0 auto', background: C.cream, minHeight: '100vh', padding: '20px' }}>
          <button onClick={() => navigate(-1)} style={btnVoltar(C.navy)}>← Voltar</button>
          <p style={{ color: '#C04848', fontSize: 14 }}>{erro ?? 'Praia não encontrada.'}</p>
        </div>
      </div>
    )
  }

  const temCoords = praia.latitude != null && praia.longitude != null

  const tipo = labelTipo(praia.tipo)
  const favoritada = isFavorita(praia.id)

  const temServicos = praia.bandeira_azul || praia.nadador_salvador || praia.acessivel || praia.restaurante ||
    praia.estacionamento !== 'inexistente'

  const ocupacao = estimarOcupacao(praia, meteo)

  const distanciaMinutos =
    coordenadas && praia.latitude != null && praia.longitude != null
      ? estimarMinutos(coordenadas.lat, coordenadas.lng, praia.latitude, praia.longitude)
      : null

  const localizacao = [
    praia.concelho || praia.distrito || null,
    distanciaMinutos != null ? `~${distanciaMinutos} min` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ background: C.navy, minHeight: '100vh' }}>
      <div style={{ maxWidth: 420, margin: '0 auto', background: C.cream, minHeight: '100vh', position: 'relative', paddingBottom: 90 }}>

        {/* Floating top bar (back only) — overlays the gallery */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          display: 'flex', alignItems: 'center',
          padding: '18px 20px',
        }}>
          <button onClick={() => navigate(-1)} aria-label="Voltar" style={tapTarget}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.creamText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Photo gallery — full width at top */}
        <GaleriaFotos fotos={fotos} />

        {/* HERO — name section with navy bg + wave transition to cream */}
        <section style={{
          background: C.navy,
          padding: '18px 20px 70px',
          position: 'relative',
          zIndex: 10,
        }}>
          <svg
            aria-hidden
            style={{ position: 'absolute', bottom: -1, left: 0, width: '100%', height: 60, display: 'block' }}
            viewBox="0 0 420 60" preserveAspectRatio="none"
          >
            <path d="M0,28 Q105,0 210,28 T420,28 L420,60 L0,60 Z" fill={C.cream} />
          </svg>

          {/* Tag + heart row, then name + location */}
          <div style={{ position: 'relative', marginTop: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, marginBottom: 10, minHeight: 36,
            }}>
              {tipo ? (
                <span style={{
                  border: `1px solid rgba(245,239,224,0.3)`,
                  color: C.creamDim,
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.5px',
                }}>
                  {tipo}
                </span>
              ) : <span />}
              <button
                  onClick={() => toggleFavorita(praia.id)}
                  aria-label="Favorita"
                  style={{
                    background: 'transparent',
                    border: `1.5px solid rgba(245,239,224,0.28)`,
                    borderRadius: '50%',
                    width: 36, height: 36,
                    cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24"
                    fill={favoritada ? C.creamText : 'none'}
                    stroke={C.creamText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
            </div>
            <h1 style={{
              fontSize: 34, fontWeight: 500, lineHeight: 1.05,
              color: C.creamText, margin: 0, letterSpacing: '-0.5px',
            }}>
              {praia.nome}
            </h1>
            {localizacao && (
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
            )}
          </div>
        </section>

        {/* BODY */}
        <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Weather + quality */}
          <div style={cardStyle}>
            {meteo ? (
              <>
                {/* Big icon + status on the left, big temperature on the right */}
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 22 }}>
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'flex-end', gap: 10,
                  }}>
                    <span style={{ display: 'flex', lineHeight: 1, color: C.navy }} aria-hidden>
                      {iconeEstadoTempo(meteo.estado_tempo, meteo.precipitacao, 56, isNoiteAgora())}
                    </span>
                    <p style={{
                      fontSize: 13, fontWeight: 400, color: C.navyDim,
                      margin: 0, lineHeight: 1.2, textAlign: 'center',
                    }}>
                      {meteo.estado_tempo ?? '—'}
                    </p>
                  </div>

                  <div style={{ width: 1, background: 'rgba(30,58,95,0.2)', margin: '0 16px', flexShrink: 0 }} />

                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'flex-end', gap: 6,
                  }}>
                    {meteo.temp_max != null ? (
                      <p style={{
                        fontSize: 56, fontWeight: 300, color: C.navy,
                        margin: 0, lineHeight: 1, letterSpacing: '-2px',
                      }}>
                        {Math.round(meteo.temp_max)}°
                      </p>
                    ) : (
                      <p style={{ fontSize: 56, fontWeight: 300, color: C.navy, margin: 0, lineHeight: 1 }}>—</p>
                    )}
                    {meteo.temp_min != null && (
                      <p style={{
                        fontSize: 12, fontWeight: 400, color: C.navyDim,
                        margin: 0, lineHeight: 1,
                        fontFeatureSettings: '"tnum"',
                      }}>
                        mín {Math.round(meteo.temp_min)}°
                      </p>
                    )}
                  </div>
                </div>

                {/* Row 1 — atmosphere */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <DataBox icone={<IcRain />} label="Precip." value={meteo.precipitacao_prob != null ? `${meteo.precipitacao_prob}%` : '—'} />
                  <DataBox icone={<IcWind />} label="Vento" value={meteo.vento_intensidade != null ? labelVento(meteo.vento_intensidade) : '—'} />
                  <DataBox icone={<IcSun />} label="UV" value={labelUV(meteo.uv_index)} />
                </div>

                {/* Row 2 — water */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <DataBox
                    icone={<IcDrop />}
                    label="Água"
                    value={qualidade?.classificacao ? (QUALIDADE_LABEL[qualidade.classificacao] ?? '—') : '—'}
                  />
                  <DataBox icone={<IcThermo />} label="Temp. água" value={meteo.temp_agua != null ? `${meteo.temp_agua}°C` : '—'} />
                  <DataBox icone={<IcWave />} label="Ondulação" value={meteo.ondulacao_altura != null ? `${meteo.ondulacao_altura}m` : '—'} />
                </div>

              </>
            ) : (
              <p style={{ color: C.navyDim, fontSize: 13, margin: 0 }}>Sem dados meteorológicos para hoje.</p>
            )}
          </div>

          {/* Hourly forecast */}
          <PrevisaoHoraria horas={horas} />

          {/* Occupation */}
          <IndicadorOcupacao nivel={ocupacao.nivel} fonte={ocupacao.fonte} variant="card" />

          {/* Services */}
          <div style={cardStyle}>
            <p style={labelStyle}>Serviços</p>
            {temServicos ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {praia.bandeira_azul && <Servico texto="Bandeira Azul" icon={<SvFlag />} />}
                  {praia.nadador_salvador && <Servico texto="Nadador-Salvador" icon={<SvLifeBuoy />} />}
                  {praia.acessivel && <Servico texto="Acessível" icon={<SvAccess />} />}
                  {praia.restaurante && <Servico texto="Bar/Restaurante" icon={<SvUtensils />} />}
                  {praia.estacionamento === 'gratuito' && <Servico texto="Estac. grátis" icon={<SvParking />} />}
                  {praia.estacionamento === 'pago' && <Servico texto="Estac. pago" icon={<SvParking />} />}
                  {praia.estacionamento == null && <Servico texto="Estacionamento" icon={<SvParking />} />}
                </div>
                {praia.estacionamento_capacidade != null && (
                  <p style={{ fontSize: 12, color: C.navyDim, margin: '12px 0 0' }}>
                    ~{praia.estacionamento_capacidade} lugares
                    {praia.estacionamento_distancia_metros != null ? ` · ${praia.estacionamento_distancia_metros}m da praia` : ''}
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: C.navyDim, margin: 0 }}>Sem informação de serviços.</p>
            )}
          </div>

          {/* Nearby */}
          <PontosInteresse pontos={pontos} />

          {/* Description */}
          {praia.descricao && (
            <div style={cardStyle}>
              <p style={labelStyle}>Descrição</p>
              <p style={{ fontSize: 13, color: C.navy, lineHeight: 1.6, margin: 0, opacity: 0.85 }}>
                {praia.descricao}
              </p>
            </div>
          )}

          {/* Mini-map */}
          {praia.latitude != null && praia.longitude != null && (
            <div style={{ borderRadius: 16, overflow: 'hidden', height: 240, boxShadow: '0 1px 3px rgba(30,58,95,0.06)' }}>
              <MapContainer
                center={[praia.latitude, praia.longitude]}
                zoom={14}
                minZoom={6}
                maxBounds={PORTUGAL_BOUNDS}
                maxBoundsViscosity={1.0}
                attributionControl={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
                <Marker
                  position={[praia.latitude, praia.longitude]}
                  icon={ICONE_PRAIA}
                  eventHandlers={{
                    mouseover: (e) => e.target.openPopup(),
                    mouseout: (e) => e.target.closePopup(),
                  }}
                >
                  <Popup closeButton={false} autoPan={false}>
                    <strong style={{ display: 'block', marginBottom: 2 }}>{praia.nome}</strong>
                    {praia.concelho && <span style={{ fontSize: 11, color: '#666' }}>{praia.concelho}</span>}
                    {meteo?.temp_max != null && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#444', marginTop: 2 }}>
                        <span style={{ color: C.navy }}>{iconeEstadoTempo(meteo.estado_tempo, meteo.precipitacao, 14, isNoiteAgora())}</span>
                        {meteo.temp_max}°C
                      </span>
                    )}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          )}

          {/* Directions */}
          {temCoords && (
            <button
              type="button"
              onClick={() => abrirNavegacao(praia.latitude, praia.longitude, praia.nome)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'center',
                background: C.navy,
                color: C.creamText,
                fontWeight: 500,
                borderRadius: 22,
                padding: '14px',
                border: 'none',
                cursor: 'pointer',
                fontSize: 15,
                marginTop: 4,
                boxShadow: '0 4px 14px rgba(30,58,95,0.22)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              Como chegar
            </button>
          )}
        </div>
      </div>
      {sheetNavegacao}
    </div>
  )
}

// --- helpers ---

const cardStyle: React.CSSProperties = {
  background: C.white,
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 1px 3px rgba(30,58,95,0.06)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: C.navyDim,
  letterSpacing: '2.5px',
  textTransform: 'uppercase',
  marginBottom: 14,
  marginTop: 0,
}

function btnVoltar(color: string): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    color,
  }
}

const tapTarget: React.CSSProperties = {
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
}

function SvFlag() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />
    </svg>
  )
}
function SvLifeBuoy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 4.24 4.24" />
      <path d="m14.83 9.17 4.24-4.24" />
      <path d="m14.83 14.83 4.24 4.24" />
      <path d="m9.17 14.83-4.24 4.24" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
}
function SvAccess() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="4" r="1" />
      <path d="m18 19 1-7-6 1" />
      <path d="m5 8 3-3 5.5 3-2.36 3.5" />
      <path d="M4.24 14.5a5 5 0 0 0 6.88 6" />
      <path d="M13.76 17.5a5 5 0 0 0-6.88-6" />
    </svg>
  )
}
function SvUtensils() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  )
}
function SvParking() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
    </svg>
  )
}

function Servico({ icon, texto }: { icon: React.ReactNode; texto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ fontSize: 14, color: C.navy, fontWeight: 500 }}>{texto}</span>
    </div>
  )
}

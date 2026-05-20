import { Link } from 'react-router-dom'
import { labelVento, iconeEstadoTempo, labelQualidadeAgua, labelUV, isNoiteAgora } from '../lib/utils'
import IndicadorOcupacao from './IndicadorOcupacao'
import type { RecomendacaoResult } from '../types'

function DataBox({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div style={{
      flex: 1,
      background: 'rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: '10px 6px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 16, fontWeight: 500, color: 'white' }}>{value}</span>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
    </div>
  )
}

function Badge({ texto }: { texto: string }) {
  return (
    <span style={{
      border: '0.5px solid rgba(255,255,255,0.2)',
      color: 'rgba(255,255,255,0.7)',
      borderRadius: 20,
      padding: '3px 10px',
      fontSize: 10,
    }}>
      {texto}
    </span>
  )
}

function IcCoracao({ preenchido }: { preenchido: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24"
      fill={preenchido ? 'white' : 'none'}
      stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function CartaoPrincipal({
  rec,
  isFavorita,
  onToggleFavorita,
}: {
  rec: RecomendacaoResult
  isFavorita: boolean
  onToggleFavorita: () => void
}) {
  const { praia, motivo } = rec
  const m = praia.meteo

  const temParking = praia.estacionamento !== 'inexistente'

  return (
    <div style={{ background: '#1A6FB5', borderRadius: 16, padding: '18px 18px 16px' }}>
      <p style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.5)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 12 }}>
        Recomendação do dia
      </p>

      {/* Beach name + favourite button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <Link to={`/praia/${praia.id}`} style={{ textDecoration: 'none', flex: 1 }}>
          <h2 style={{ fontSize: 24, fontWeight: 500, color: 'white', lineHeight: 1.2, margin: 0 }}>{praia.nome}</h2>
        </Link>
        <button
          onClick={onToggleFavorita}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 12px', flexShrink: 0, display: 'flex' }}
        >
          <IcCoracao preenchido={isFavorita} />
        </button>
      </div>

      {/* Location + distance */}
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 14px' }}>
        {[praia.concelho, praia.distancia_minutos != null ? `~${praia.distancia_minutos} min` : null]
          .filter(Boolean).join(' · ')}
      </p>

      {/* Weather state row: icon + state text + separator + temp max/min */}
      {m && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>{iconeEstadoTempo(m.estado_tempo, m.precipitacao, 28, isNoiteAgora())}</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', flex: 1, lineHeight: 1.2 }}>{m.estado_tempo ?? '—'}</span>
          {(m.temp_max != null || m.temp_min != null) && (
            <>
              <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {m.temp_max != null && (
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'white', margin: 0, lineHeight: 1 }}>{m.temp_max}°C</p>
                )}
                {m.temp_min != null && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0', lineHeight: 1 }}>{m.temp_min}°C mín</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 3 data boxes: wind | water quality | UV */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <DataBox
          icon="💨"
          value={m?.vento_intensidade != null ? labelVento(m.vento_intensidade) : '—'}
          label="vento"
        />
        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 10,
          padding: '10px 6px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}>
          <span style={{ fontSize: 20 }}>💧</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>
            {labelQualidadeAgua(praia.qualidade_agua?.classificacao)}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>qualidade</span>
        </div>
        <DataBox
          icon="☀️"
          value={labelUV(m?.uv_index)}
          label="UV"
        />
      </div>

      {/* Occupation indicator */}
      <div style={{ marginBottom: 14 }}>
        <IndicadorOcupacao nivel={praia.ocupacao_atual} fonte={praia.ocupacao_fonte} />
      </div>

      {/* Service badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {praia.bandeira_azul && <Badge texto="Bandeira Azul" />}
        {praia.nadador_salvador && <Badge texto="Nadador-Salvador" />}
        {praia.acessivel && <Badge texto="Acessível" />}
        {temParking && <Badge texto={praia.estacionamento === 'gratuito' ? 'Estac. grátis' : praia.estacionamento === 'pago' ? 'Estac. pago' : 'Estacionamento'} />}
        {praia.restaurante && <Badge texto="Restaurante" />}
      </div>

      {motivo && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 10, fontStyle: 'italic' }}>
          {motivo}
        </p>
      )}
    </div>
  )
}

export function CartaoSecundario({ rec }: { rec: RecomendacaoResult }) {
  const { praia, motivo } = rec
  const m = praia.meteo

  return (
    <Link to={`/praia/${praia.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        background: '#132A3A',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'background 0.2s ease',
      }}>
        <div style={{
          width: 40,
          height: 40,
          background: '#1A3D52',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#E8EDF2',
          flexShrink: 0,
        }}>
          {iconeEstadoTempo(m?.estado_tempo, m?.precipitacao, 20, isNoiteAgora())}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: '#E8EDF2', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {praia.nome}
          </p>
          <p style={{ fontSize: 12, color: '#7A8A9E', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[praia.concelho, motivo].filter(Boolean).join(' · ')}
          </p>
        </div>
        {praia.distancia_minutos != null && (
          <span style={{ fontSize: 13, color: '#1A6FB5', fontWeight: 500, flexShrink: 0 }}>
            ~{praia.distancia_minutos} min
          </span>
        )}
      </div>
    </Link>
  )
}

function Skeleton() {
  return (
    <div style={{ background: '#132A3A', borderRadius: 16, height: 220 }} className="animate-pulse" />
  )
}

interface RecomendacaoDiaProps {
  recomendacoes: RecomendacaoResult[]
  loading: boolean
  erro: string | null
  isFavorita: boolean
  onToggleFavorita: () => void
}

export default function RecomendacaoDia({ recomendacoes, loading, erro, isFavorita, onToggleFavorita }: RecomendacaoDiaProps) {
  if (loading) return <Skeleton />

  if (erro) {
    return (
      <div style={{ background: '#132A3A', borderRadius: 16, padding: 16 }}>
        <p style={{ color: '#ff6b6b', fontSize: 14, margin: 0 }}>Erro ao carregar: {erro}</p>
      </div>
    )
  }

  if (recomendacoes.length === 0) {
    return (
      <div style={{ background: '#132A3A', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#5A7A8A', fontSize: 14, margin: 0 }}>Sem praias no raio selecionado.</p>
      </div>
    )
  }

  return (
    <CartaoPrincipal
      rec={recomendacoes[0]}
      isFavorita={isFavorita}
      onToggleFavorita={onToggleFavorita}
    />
  )
}

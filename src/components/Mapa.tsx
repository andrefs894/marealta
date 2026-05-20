import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PraiaComMeteo, RecomendacaoResult } from '../types'
import { haversineKm, iconeEstadoTempo } from '../lib/utils'

const PORTUGAL_BOUNDS: L.LatLngBoundsExpression = [[36.3, -10.0], [42.5, -5.8]]

function criarIconePraia(destaque: boolean) {
  if (destaque) {
    return L.divIcon({
      className: '',
      html: `<div class="marker-pulse" style="width:16px;height:16px;background:#FF8C00;border-radius:50%;border:2px solid rgba(255,140,0,0.3)"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
  }
  return L.divIcon({
    className: '',
    html: `<div style="width:8px;height:8px;background:#06B6D4;border-radius:50%;border:1.5px solid rgba(6,182,212,0.5)"></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  })
}

const ICONE_UTILIZADOR = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:#E8EDF2;border-radius:50%;border:2px solid rgba(232,237,242,0.4)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

function VistaAdaptavel({
  coordenadas,
  radiusKm,
}: {
  coordenadas: { lat: number; lng: number } | null
  radiusKm: number
}) {
  const map = useMap()
  useEffect(() => {
    if (!coordenadas) return
    const center = L.latLng(coordenadas.lat, coordenadas.lng)
    const bounds = center.toBounds(radiusKm * 1000 * 2)
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 })
  }, [coordenadas, radiusKm, map])
  return null
}

interface MapaProps {
  praias: PraiaComMeteo[]
  recomendacoes: RecomendacaoResult[]
  coordenadas: { lat: number; lng: number } | null
  radiusKm: number
  onRadiusChange: (km: number) => void
}

export default function Mapa({ praias, recomendacoes, coordenadas, radiusKm, onRadiusChange }: MapaProps) {
  const topId = recomendacoes[0]?.praia.id
  const fecharPopup = useRef<ReturnType<typeof setTimeout> | null>(null)

  const praiasVisiveis = praias.filter(p => {
    if (p.latitude == null || p.longitude == null) return false
    if (!coordenadas) return true
    return haversineKm(coordenadas.lat, coordenadas.lng, p.latitude, p.longitude) <= radiusKm
  })

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', height: 280 }}>
      <MapContainer
        center={[39.5, -8.0]}
        zoom={7}
        minZoom={6}
        maxBounds={PORTUGAL_BOUNDS}
        maxBoundsViscosity={1.0}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        <VistaAdaptavel coordenadas={coordenadas} radiusKm={radiusKm} />

        {coordenadas && (
          <Circle
            center={[coordenadas.lat, coordenadas.lng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#06B6D4',
              fillColor: '#06B6D4',
              fillOpacity: 0.06,
              weight: 1,
              dashArray: '5, 4',
            }}
          />
        )}

        {praiasVisiveis.map(p => (
          <Marker
            key={p.id}
            position={[p.latitude!, p.longitude!]}
            icon={criarIconePraia(p.id === topId)}
            zIndexOffset={p.id === topId ? 1000 : 0}
            eventHandlers={{
              mouseover: (e) => {
                if (fecharPopup.current) clearTimeout(fecharPopup.current)
                e.target.openPopup()
              },
              mouseout: (e) => {
                fecharPopup.current = setTimeout(() => (e.target as L.Marker).closePopup(), 300)
              },
              popupopen: (e) => {
                const el = (e as unknown as L.PopupEvent).popup.getElement()
                if (!el || el.dataset.hoverReady) return
                el.dataset.hoverReady = 'true'
                const marker = e.target as L.Marker
                el.addEventListener('mouseenter', () => {
                  if (fecharPopup.current) clearTimeout(fecharPopup.current)
                })
                el.addEventListener('mouseleave', () => {
                  fecharPopup.current = setTimeout(() => marker.closePopup(), 300)
                })
              },
            }}
          >
            <Popup closeButton={false} autoPan={false}>
              <Link
                to={`/praia/${p.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block', minWidth: 120 }}
              >
                <strong style={{ display: 'block', marginBottom: 2 }}>{p.nome}</strong>
                {p.concelho && <span style={{ fontSize: 11, color: '#666' }}>{p.concelho}</span>}
                {p.meteo?.temp_max != null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#444', marginTop: 2 }}>
                    <span style={{ color: '#1E3A5F' }}>{iconeEstadoTempo(p.meteo.estado_tempo, p.meteo.precipitacao, 14)}</span>
                    {p.meteo.temp_max}°C
                  </span>
                )}
              </Link>
            </Popup>
          </Marker>
        ))}

        {coordenadas && (
          <Marker position={[coordenadas.lat, coordenadas.lng]} icon={ICONE_UTILIZADOR}>
            <Popup>A tua localização</Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Radius toggle — overlaid top-right */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: 'white',
        borderRadius: 20,
        border: '0.5px solid #D0DDE8',
        display: 'flex',
        padding: 2,
        gap: 2,
      }}>
        {([25, 50, 100, 200] as const).map(km => (
          <button
            key={km}
            onClick={() => onRadiusChange(km)}
            style={{
              padding: '4px 10px',
              borderRadius: 16,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              background: radiusKm === km ? '#1A6FB5' : 'transparent',
              color: radiusKm === km ? 'white' : '#7A8A9E',
              transition: 'all 0.2s ease',
            }}
          >
            {km} km
          </button>
        ))}
      </div>
    </div>
  )
}

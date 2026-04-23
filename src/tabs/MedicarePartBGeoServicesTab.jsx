import { memo, useEffect, useMemo, useState } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import usStatesGeo from 'us-atlas/states-10m.json'
import { TAB_BAR_APPROX_PX } from './tabConstants'

const PALETTE = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8']
const EMPTY_ARRAY = []
const fmtNum = (value) => Number(value || 0).toLocaleString()
const fmtMoney = (value) => `$${Number(value || 0).toFixed(2)}`

const Card = ({ children, fullWidth }) => (
  <div
    style={{
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: '24px 28px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
      gridColumn: fullWidth ? '1 / -1' : undefined,
    }}
  >
    {children}
  </div>
)

const ChartTitle = ({ title, subtitle }) => (
  <div style={{ marginBottom: 14 }}>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{title}</h2>
    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{subtitle}</p>
  </div>
)

const Insight = ({ children }) => (
  <p
    style={{
      margin: '14px 0 0',
      padding: '10px 12px',
      backgroundColor: '#f8fafc',
      borderLeft: '3px solid #3b82f6',
      borderRadius: '0 6px 6px 0',
      color: '#475569',
      fontSize: 13,
      lineHeight: 1.55,
    }}
  >
    {children}
  </p>
)

let mupAggregateCache = null
let mupAggregatePromise = null

function buildLegendRanges(maxValue) {
  if (!maxValue) return [{ label: '0', color: '#e2e8f0' }]
  const b1 = Math.max(1, Math.floor(maxValue * 0.2))
  const b2 = Math.max(b1 + 1, Math.floor(maxValue * 0.4))
  const b3 = Math.max(b2 + 1, Math.floor(maxValue * 0.6))
  const b4 = Math.max(b3 + 1, Math.floor(maxValue * 0.8))
  return [
    { label: '0', color: '#e2e8f0' },
    { label: `1-${b1}`, color: PALETTE[0] },
    { label: `${b1 + 1}-${b2}`, color: PALETTE[1] },
    { label: `${b2 + 1}-${b3}`, color: PALETTE[2] },
    { label: `${b3 + 1}-${b4}`, color: PALETTE[3] },
    { label: `${b4 + 1}-${Math.round(maxValue)}`, color: PALETTE[4] },
  ]
}

function colorForValue(value, maxValue) {
  if (!maxValue || !value) return '#e2e8f0'
  const ratio = value / maxValue
  if (ratio >= 0.8) return PALETTE[4]
  if (ratio >= 0.6) return PALETTE[3]
  if (ratio >= 0.4) return PALETTE[2]
  if (ratio >= 0.2) return PALETTE[1]
  return PALETTE[0]
}

function loadMupAggregates(onProgress) {
  if (mupAggregateCache) return Promise.resolve(mupAggregateCache)
  if (mupAggregatePromise) return mupAggregatePromise

  mupAggregatePromise = new Promise((resolve, reject) => {
    fetch('/precomputed/mup_geo_services.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Precomputed MUP fetch failed (${response.status})`)
        return response.json()
      })
      .then((payload) => {
        if (onProgress) onProgress(payload?.rowCount || 0)
        mupAggregateCache = payload
        mupAggregatePromise = null
        resolve(payload)
      })
      .catch((error) => {
        mupAggregatePromise = null
        reject(error)
      })
  })

  return mupAggregatePromise
}

const BASE_MAP_SHAPES = (() => {
  const statesFeatureCollection = feature(usStatesGeo, usStatesGeo.objects.states)
  const projection = geoAlbersUsa().fitSize([960, 600], statesFeatureCollection)
  const pathGenerator = geoPath(projection)
  return (statesFeatureCollection.features || []).map((stateFeature) => ({
    id: stateFeature.id,
    name: stateFeature.properties?.name || stateFeature.id,
    path: pathGenerator(stateFeature) || '',
  }))
})()

function MedicarePartBGeoServicesTab() {
  const [aggregate, setAggregate] = useState(() => mupAggregateCache)
  const [loading, setLoading] = useState(() => mupAggregateCache == null)
  const [progressRows, setProgressRows] = useState(0)
  const [metric, setMetric] = useState('services')
  const [topN, setTopN] = useState(20)

  useEffect(() => {
    if (!loading) return
    let cancelled = false
    loadMupAggregates((rows) => {
      if (!cancelled) setProgressRows(rows)
    })
      .then((data) => {
        if (cancelled) return
        setAggregate(data)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loading])

  const mapMetricKey = metric === 'beneficiaries' ? 'sumBenes' : metric === 'payment' ? 'weightedPayment' : 'sumSvc'
  const mapMetricLabel = metric === 'beneficiaries' ? 'Beneficiaries' : metric === 'payment' ? 'Weighted Medicare Payment' : 'Services'

  const stateRows = aggregate?.stateData ?? EMPTY_ARRAY
  const mapByFips = useMemo(() => {
    const result = {}
    stateRows.forEach((row) => {
      result[row.fips] = row[mapMetricKey]
    })
    return result
  }, [stateRows, mapMetricKey])

  const rankedStates = useMemo(
    () => [...stateRows].sort((a, b) => b[mapMetricKey] - a[mapMetricKey]).slice(0, topN),
    [stateRows, mapMetricKey, topN],
  )

  const mapMax = useMemo(() => {
    if (!stateRows.length) return 0
    return stateRows.reduce((max, row) => (row[mapMetricKey] > max ? row[mapMetricKey] : max), 0)
  }, [stateRows, mapMetricKey])
  const legendRanges = useMemo(() => buildLegendRanges(mapMax), [mapMax])

  const mapShapes = useMemo(
    () =>
      BASE_MAP_SHAPES.map((shape) => ({
        ...shape,
        value: mapByFips[shape.id] || 0,
      })),
    [mapByFips],
  )

  const kpis = useMemo(() => {
    const totalServices = stateRows.reduce((sum, row) => sum + row.sumSvc, 0)
    const totalBenes = stateRows.reduce((sum, row) => sum + row.sumBenes, 0)
    const totalProviders = stateRows.reduce((sum, row) => sum + row.sumProviders, 0)
    return {
      states: stateRows.length,
      totalServices,
      totalBenes,
      totalProviders,
    }
  }, [stateRows])

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: '#f1f5f9',
          minHeight: `calc(100vh - ${TAB_BAR_APPROX_PX}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', color: '#475569' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Loading Medicare Part B Geo dataset...</div>
          <div style={{ fontSize: 13 }}>Parsed rows: {fmtNum(progressRows)}</div>
        </div>
      </div>
    )
  }

  if (!aggregate) {
    return <div style={{ padding: 24 }}>Unable to load MUP dataset.</div>
  }

  return (
    <div
      style={{
        backgroundColor: '#f1f5f9',
        minHeight: `calc(100vh - ${TAB_BAR_APPROX_PX}px)`,
        paddingBottom: 60,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: '#fff',
          padding: '42px 32px 34px',
          marginBottom: 30,
        }}
      >
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Medicare Part B Geo Services
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: '#94a3b8', lineHeight: 1.5 }}>
            Original Medicare Part B physician/professional services by geography and HCPCS · {fmtNum(aggregate.rowCount)} rows parsed
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#475569' }}>
            Metric:{' '}
            <select value={metric} onChange={(event) => setMetric(event.target.value)} style={{ marginLeft: 6, padding: '7px 9px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
              <option value="services">Total Services</option>
              <option value="beneficiaries">Total Beneficiaries</option>
              <option value="payment">Weighted Medicare Payment</option>
            </select>
          </label>
          <label style={{ fontSize: 13, color: '#475569' }}>
            Top N:{' '}
            <select value={topN} onChange={(event) => setTopN(Number(event.target.value))} style={{ marginLeft: 6, padding: '7px 9px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'States Covered', value: fmtNum(kpis.states), sub: 'State-level rows only', color: '#2563eb' },
            { label: 'Total Services', value: fmtNum(Math.round(kpis.totalServices)), sub: 'Sum across states', color: '#059669' },
            { label: 'Total Beneficiaries', value: fmtNum(Math.round(kpis.totalBenes)), sub: 'Sum across states', color: '#d97706' },
            { label: 'Rendering Providers', value: fmtNum(Math.round(kpis.totalProviders)), sub: 'Service-level aggregate', color: '#7c3aed' },
          ].map((kpi) => (
            <div key={kpi.label} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderTop: `3px solid ${kpi.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '4px 0 2px' }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Card fullWidth>
            <ChartTitle title={`US State Heatmap (${mapMetricLabel})`} subtitle="Color intensity follows the selected state metric." />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                <svg viewBox="0 0 960 600" style={{ width: '100%', height: 'auto' }} role="img" aria-label="US states metric heatmap">
                  {mapShapes.map((shape) => (
                    <path key={shape.id} d={shape.path} fill={colorForValue(shape.value, mapMax)} stroke="#fff" strokeWidth={1}>
                      <title>{`${shape.name}: ${metric === 'payment' ? fmtMoney(shape.value) : fmtNum(Math.round(shape.value))}`}</title>
                    </path>
                  ))}
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Legend ({mapMetricLabel})</div>
                {legendRanges.map((entry) => (
                  <div key={entry.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: '#64748b' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: entry.color, display: 'inline-block' }} />
                    {entry.label}
                  </div>
                ))}
              </div>
            </div>
            <Insight>
              This map compares state-level Medicare Part B activity at a glance using the selected metric. Darker states have higher totals, helping you quickly identify geographic concentration and regional outliers.
            </Insight>
          </Card>

          <Card>
            <ChartTitle title={`Top ${topN} States by ${mapMetricLabel}`} subtitle="State ranking updates with selected metric." />
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={rankedStates} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => (metric === 'payment' ? `$${Number(v).toFixed(0)}` : fmtNum(Math.round(v)))} />
                <YAxis dataKey="stateCode" type="category" width={44} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => (metric === 'payment' ? fmtMoney(value) : fmtNum(Math.round(value)))} />
                <Bar dataKey={mapMetricKey} fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              This ranking highlights which states contribute the largest share of the selected measure. Use it with the map to confirm whether high-activity states are clustered or spread across regions.
            </Insight>
          </Card>

          <Card>
            <ChartTitle title="Top HCPCS Services (National)" subtitle="Highest service-volume HCPCS codes from national-level rows." />
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={aggregate.hcpcsData.slice(0, topN)} margin={{ top: 8, right: 12, left: 12, bottom: 72 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="code" angle={-40} textAnchor="end" interval={0} height={80} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Math.round(v))} />
                <Tooltip formatter={(value) => fmtNum(Math.round(value))} />
                <Bar dataKey="totSrvcs" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Services" />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              This chart shows the procedures driving the highest national service volume. It helps separate broad, high-frequency services from lower-volume codes that may still be high cost.
            </Insight>
          </Card>

          <Card>
            <ChartTitle title="Site of Service Mix (National)" subtitle="Office versus facility split from national rows." />
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={aggregate.posData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Math.round(v))} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Math.round(v))} />
                <Tooltip formatter={(value) => fmtNum(Math.round(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="services" fill="#22c55e" radius={[4, 4, 0, 0]} name="Services" />
                <Bar yAxisId="right" dataKey="beneficiaries" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Beneficiaries" />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              This view compares where care is delivered: office settings versus facilities. Differences between services and beneficiaries can signal whether certain settings are associated with higher repeat utilization.
            </Insight>
          </Card>

          <Card fullWidth>
            <ChartTitle title="Drug vs Non-Drug Mix (National)" subtitle="Service and beneficiary totals split by HCPCS drug indicator." />
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={aggregate.drugData} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Math.round(v))} />
                <Tooltip formatter={(value) => fmtNum(Math.round(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="services" fill="#6366f1" radius={[4, 4, 0, 0]} name="Services" />
                <Bar dataKey="beneficiaries" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Beneficiaries" />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              This split shows how much overall Medicare Part B volume is tied to drug-indicated versus non-drug HCPCS codes. It is useful for understanding whether utilization patterns are primarily medication-driven or procedure-driven.
            </Insight>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default memo(MedicarePartBGeoServicesTab)

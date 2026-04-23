import { memo, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import usStatesGeo from 'us-atlas/states-10m.json'
import { TAB_BAR_APPROX_PX } from './tabConstants'

const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22',
  ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
  NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40',
  OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50',
  VA: '51', WA: '53', WV: '54', WI: '55', WY: '56', DC: '11',
}

const PALETTE = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8']

const fmtNum = (value) => Number(value || 0).toLocaleString()
const formatMonthLabel = (yearMonth) => {
  const [year, month] = yearMonth.split('-')
  return `${year}-${month}`
}

const Card = ({ children, fullWidth, style }) => (
  <div
    style={{
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: '24px 28px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
      gridColumn: fullWidth ? '1 / -1' : undefined,
      ...style,
    }}
  >
    {children}
  </div>
)

const ChartTitle = ({ title, subtitle }) => (
  <div style={{ marginBottom: 14 }}>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{title}</h2>
    {subtitle ? (
      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{subtitle}</p>
    ) : null}
  </div>
)

let chowRowsCache = null
let chowRowsPromise = null

function loadChowRows() {
  if (chowRowsCache) return Promise.resolve(chowRowsCache)
  if (chowRowsPromise) return chowRowsPromise

  chowRowsPromise = new Promise((resolve, reject) => {
    fetch('/precomputed/change_ownership.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Precomputed CHOW fetch failed (${response.status})`)
        return response.json()
      })
      .then((payload) => {
        const rows = (payload?.rows || []).map((row) => ({
          ...row,
          date: row.dateIso ? new Date(row.dateIso) : null,
        }))
        chowRowsCache = rows
        chowRowsPromise = null
        resolve(rows)
      })
      .catch((error) => {
        chowRowsPromise = null
        reject(error)
      })
  })

  return chowRowsPromise
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

function buildLegendRanges(maxValue) {
  if (!maxValue) return [{ label: '0', color: '#e2e8f0' }]
  return [
    { label: '0', color: '#e2e8f0' },
    { label: `1-${Math.max(1, Math.floor(maxValue * 0.2))}`, color: PALETTE[0] },
    {
      label: `${Math.floor(maxValue * 0.2) + 1}-${Math.max(Math.floor(maxValue * 0.2) + 1, Math.floor(maxValue * 0.4))}`,
      color: PALETTE[1],
    },
    {
      label: `${Math.floor(maxValue * 0.4) + 1}-${Math.max(Math.floor(maxValue * 0.4) + 1, Math.floor(maxValue * 0.6))}`,
      color: PALETTE[2],
    },
    {
      label: `${Math.floor(maxValue * 0.6) + 1}-${Math.max(Math.floor(maxValue * 0.6) + 1, Math.floor(maxValue * 0.8))}`,
      color: PALETTE[3],
    },
    { label: `${Math.floor(maxValue * 0.8) + 1}-${maxValue}`, color: PALETTE[4] },
  ]
}

function ChangeOfOwnershipTab() {
  const [rows, setRows] = useState(() => chowRowsCache ?? [])
  const [loading, setLoading] = useState(() => chowRowsCache == null)
  const [selectedState, setSelectedState] = useState('ALL')

  useEffect(() => {
    if (!loading) return

    let cancelled = false
    loadChowRows()
      .then((nextRows) => {
        if (cancelled) return
        setRows(nextRows)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loading])

  const filteredRows = useMemo(() => {
    if (selectedState === 'ALL') return rows
    return rows.filter((row) => row.buyerState === selectedState || row.sellerState === selectedState)
  }, [rows, selectedState])

  const states = useMemo(() => {
    const codes = new Set()
    rows.forEach((row) => {
      if (row.buyerState) codes.add(row.buyerState)
      if (row.sellerState) codes.add(row.sellerState)
    })
    return [...codes].sort()
  }, [rows])

  const stats = useMemo(() => {
    if (!filteredRows.length) return null
    const datedRows = filteredRows.filter((row) => row.date)
    const minDate = datedRows.reduce((acc, row) => (row.date < acc ? row.date : acc), datedRows[0]?.date)
    const maxDate = datedRows.reduce((acc, row) => (row.date > acc ? row.date : acc), datedRows[0]?.date)
    const uniqueBuyers = new Set(filteredRows.map((row) => row.buyerId)).size
    const uniqueSellers = new Set(filteredRows.map((row) => row.sellerId)).size
    const crossState = filteredRows.filter(
      (row) => row.buyerState && row.sellerState && row.buyerState !== row.sellerState,
    ).length
    return {
      totalEvents: filteredRows.length,
      uniqueBuyers,
      uniqueSellers,
      crossState,
      crossStatePct: filteredRows.length ? (crossState / filteredRows.length) * 100 : 0,
      minDate,
      maxDate,
    }
  }, [filteredRows])

  const mapData = useMemo(() => {
    const counts = {}
    filteredRows.forEach((row) => {
      if (!row.buyerState) return
      counts[row.buyerState] = (counts[row.buyerState] || 0) + 1
    })
    const maxCount = Object.values(counts).reduce((max, count) => (count > max ? count : max), 0)
    const byFips = {}
    Object.entries(counts).forEach(([abbr, count]) => {
      const fips = STATE_FIPS[abbr]
      if (fips) byFips[fips] = count
    })
    return { counts, byFips, maxCount }
  }, [filteredRows])
  const mapLegend = useMemo(() => buildLegendRanges(mapData.maxCount), [mapData.maxCount])

  const mapShapes = useMemo(() => {
    const statesFeatureCollection = feature(usStatesGeo, usStatesGeo.objects.states)
    const features = statesFeatureCollection.features || []
    const width = 960
    const height = 600
    const projection = geoAlbersUsa().fitSize([width, height], statesFeatureCollection)
    const pathGenerator = geoPath(projection)
    return features.map((stateFeature) => ({
      id: stateFeature.id,
      name: stateFeature.properties?.name || stateFeature.id,
      path: pathGenerator(stateFeature) || '',
      value: mapData.byFips[stateFeature.id] || 0,
    }))
  }, [mapData.byFips])

  const monthlyTrend = useMemo(() => {
    const byMonth = {}
    filteredRows.forEach((row) => {
      if (!row.date) return
      const month = row.yearMonth
      if (!byMonth[month]) byMonth[month] = { month, events: 0, crossState: 0 }
      byMonth[month].events += 1
      if (row.buyerState && row.sellerState && row.buyerState !== row.sellerState) {
        byMonth[month].crossState += 1
      }
    })
    const sorted = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
    return sorted.map((entry, index, source) => {
      const from = Math.max(0, index - 2)
      const window = source.slice(from, index + 1)
      const eventsAvg = window.reduce((sum, row) => sum + row.events, 0) / window.length
      const crossStateAvg = window.reduce((sum, row) => sum + row.crossState, 0) / window.length
      return {
        ...entry,
        monthLabel: formatMonthLabel(entry.month),
        eventsSmoothed: Number(eventsAvg.toFixed(2)),
        crossStateSmoothed: Number(crossStateAvg.toFixed(2)),
      }
    })
  }, [filteredRows])

  const chowTypeData = useMemo(() => {
    const byType = {}
    filteredRows.forEach((row) => {
      byType[row.chowType] = (byType[row.chowType] || 0) + 1
    })
    return Object.entries(byType)
      .map(([type, events]) => ({ type, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 10)
  }, [filteredRows])

  const topBuyers = useMemo(() => {
    const byBuyer = {}
    filteredRows.forEach((row) => {
      const key = row.buyerOrg
      if (!byBuyer[key]) byBuyer[key] = { name: key, events: 0, states: new Set() }
      byBuyer[key].events += 1
      if (row.buyerState) byBuyer[key].states.add(row.buyerState)
    })
    return Object.values(byBuyer)
      .map((entry) => ({ name: entry.name, events: entry.events, statesCount: entry.states.size }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 10)
  }, [filteredRows])

  const networkFlows = useMemo(() => {
    const byPair = {}
    filteredRows.forEach((row) => {
      if (!row.sellerState || !row.buyerState) return
      const key = `${row.sellerState}->${row.buyerState}`
      byPair[key] = (byPair[key] || 0) + 1
    })
    return Object.entries(byPair)
      .map(([key, events]) => {
        const [fromState, toState] = key.split('->')
        return { fromState, toState, events }
      })
      .sort((a, b) => b.events - a.events)
      .slice(0, 8)
  }, [filteredRows])

  const sampleRows = useMemo(() => filteredRows.slice(0, 15), [filteredRows])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: `calc(100vh - ${TAB_BAR_APPROX_PX}px)`,
          color: '#64748b',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        Loading change of ownership dataset...
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ padding: 24, color: '#64748b' }}>
        No valid change of ownership records found.
      </div>
    )
  }

  const dateRangeLabel =
    stats.minDate && stats.maxDate
      ? `${stats.minDate.toISOString().slice(0, 10)} to ${stats.maxDate.toISOString().slice(0, 10)}`
      : 'Date unavailable'

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
            Change Of Ownership
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: '#94a3b8', lineHeight: 1.5 }}>
            CMS CHOW events · {fmtNum(stats.totalEvents)} records · {dateRangeLabel}
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="state-filter" style={{ fontSize: 13, color: '#475569', marginRight: 8 }}>
            Focus state:
          </label>
          <select
            id="state-filter"
            value={selectedState}
            onChange={(event) => setSelectedState(event.target.value)}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 13,
              padding: '8px 10px',
              color: '#1e293b',
              backgroundColor: '#fff',
            }}
          >
            <option value="ALL">All states</option>
            {states.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'CHOW Events', value: fmtNum(stats.totalEvents), sub: 'Filtered scope', color: '#2563eb' },
            { label: 'Unique Buyers', value: fmtNum(stats.uniqueBuyers), sub: 'Enrollment IDs / orgs', color: '#059669' },
            { label: 'Unique Sellers', value: fmtNum(stats.uniqueSellers), sub: 'Enrollment IDs / orgs', color: '#d97706' },
            { label: 'Cross-State Deals', value: `${stats.crossStatePct.toFixed(1)}%`, sub: `${fmtNum(stats.crossState)} events`, color: '#7c3aed' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              style={{
                backgroundColor: '#fff',
                borderRadius: 12,
                padding: '20px 22px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                borderTop: `3px solid ${kpi.color}`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '4px 0 2px' }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Card fullWidth>
            <ChartTitle
              title="US Buyer-State Heatmap"
              subtitle="State intensity reflects how many change-of-ownership events list that state as the buyer state."
            />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                <svg viewBox="0 0 960 600" style={{ width: '100%', height: 'auto' }} role="img" aria-label="US state heatmap">
                  {mapShapes.map((shape) => (
                    <path
                      key={shape.id}
                      d={shape.path}
                      fill={colorForValue(shape.value, mapData.maxCount)}
                      stroke="#fff"
                      strokeWidth={1}
                    >
                      <title>{`${shape.name}: ${fmtNum(shape.value)} events`}</title>
                    </path>
                  ))}
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Legend</div>
                {mapLegend.map((entry) => (
                  <div key={entry.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: '#64748b' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: entry.color, display: 'inline-block' }} />
                    {entry.label}
                  </div>
                ))}
                <p style={{ marginTop: 12, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                  Top buyer state volume: {fmtNum(mapData.maxCount)} events.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <ChartTitle
              title="Monthly CHOW Event Trend"
              subtitle="Smoothed 3-month rolling average to make long-term patterns easier to read."
            />
            <ResponsiveContainer width="100%" height={310}>
              <LineChart data={monthlyTrend} margin={{ top: 10, right: 18, left: 10, bottom: 36 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="monthLabel" interval="preserveStartEnd" minTickGap={32} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="events" stroke="#93c5fd" strokeWidth={1.5} dot={false} name="Events (Raw)" />
                <Line type="monotone" dataKey="eventsSmoothed" stroke="#2563eb" strokeWidth={3} dot={false} name="Events (3-mo avg)" />
                <Line type="monotone" dataKey="crossStateSmoothed" stroke="#7c3aed" strokeWidth={2.5} dot={false} name="Cross-State (3-mo avg)" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <ChartTitle
              title="Top CHOW Types"
              subtitle="Most common ownership change categories in the selected scope."
            />
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={chowTypeData} margin={{ top: 10, right: 16, left: 12, bottom: 46 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="type" angle={-28} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="events" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card fullWidth>
            <ChartTitle
              title="Top Acquirers and State-to-State Flow"
              subtitle="Acquirer concentration and directional flow reveal consolidation pathways."
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', color: '#475569' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Buyer Organization</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Events</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>States</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topBuyers.map((buyer) => (
                      <tr key={buyer.name} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '7px 10px', color: '#1e293b' }}>{buyer.name}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmtNum(buyer.events)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmtNum(buyer.statesCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', color: '#475569' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>From</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>To</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkFlows.map((flow) => (
                      <tr key={`${flow.fromState}-${flow.toState}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '7px 10px' }}>{flow.fromState}</td>
                        <td style={{ padding: '7px 10px' }}>{flow.toState}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmtNum(flow.events)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card fullWidth>
            <ChartTitle
              title="Event-Level Records (Sample)"
              subtitle="A direct view into parsed CHOW rows used to build the visualizations."
            />
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', color: '#475569' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Effective Date</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>CHOW Type</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Seller</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Seller State</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Buyer</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Buyer State</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px' }}>{row.date ? row.date.toISOString().slice(0, 10) : 'Unknown'}</td>
                      <td style={{ padding: '7px 10px' }}>{row.chowType}</td>
                      <td style={{ padding: '7px 10px' }}>{row.sellerOrg}</td>
                      <td style={{ padding: '7px 10px' }}>{row.sellerState || 'N/A'}</td>
                      <td style={{ padding: '7px 10px' }}>{row.buyerOrg}</td>
                      <td style={{ padding: '7px 10px' }}>{row.buyerState || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default memo(ChangeOfOwnershipTab)

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { RevealSection } from '../components/story/RevealSection'
import { InsightList, SectionHeading, SurfaceCard } from '../components/ui/Surface'
import { usePrecomputedData } from '../hooks/usePrecomputedData'

const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22',
  ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
  NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40',
  OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50',
  VA: '51', WA: '53', WV: '54', WI: '55', WY: '56', DC: '11',
}

const MAP_COLORS = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8']
const STACK_COLORS = ['#1d4ed8', '#0f766e', '#7c3aed', '#d97706', '#0891b2', '#be185d', '#475569']

function colorForValue(value, maxValue) {
  if (!maxValue || !value) return '#e2e8f0'
  const ratio = value / maxValue
  if (ratio >= 0.8) return MAP_COLORS[4]
  if (ratio >= 0.6) return MAP_COLORS[3]
  if (ratio >= 0.4) return MAP_COLORS[2]
  if (ratio >= 0.2) return MAP_COLORS[1]
  return MAP_COLORS[0]
}

function buildLegendRanges(maxValue) {
  if (!maxValue) return [{ label: '0', color: '#e2e8f0' }]
  return [
    { label: '0', color: '#e2e8f0' },
    { label: `1-${Math.max(1, Math.floor(maxValue * 0.2))}`, color: MAP_COLORS[0] },
    {
      label: `${Math.floor(maxValue * 0.2) + 1}-${Math.max(Math.floor(maxValue * 0.2) + 1, Math.floor(maxValue * 0.4))}`,
      color: MAP_COLORS[1],
    },
    {
      label: `${Math.floor(maxValue * 0.4) + 1}-${Math.max(Math.floor(maxValue * 0.4) + 1, Math.floor(maxValue * 0.6))}`,
      color: MAP_COLORS[2],
    },
    {
      label: `${Math.floor(maxValue * 0.6) + 1}-${Math.max(Math.floor(maxValue * 0.6) + 1, Math.floor(maxValue * 0.8))}`,
      color: MAP_COLORS[3],
    },
    { label: `${Math.floor(maxValue * 0.8) + 1}-${maxValue}`, color: MAP_COLORS[4] },
  ]
}

function pct(value, total) {
  if (!total) return 0
  return Number(((value / total) * 100).toFixed(1))
}

export function ConsolidationPage() {
  const { data, loading } = usePrecomputedData('/precomputed/consolidation.json')
  const years = data?.years || []
  const [selectedYear, setSelectedYear] = useState(2024)
  const [selectedFacilityType, setSelectedFacilityType] = useState('ALL')

  const currentYear = years.includes(selectedYear) ? selectedYear : years[years.length - 1]
  const facilityTypes = data?.facilityTypes || []

  const filteredEvents = useMemo(() => {
    if (!data?.events?.length) return []
    return data.events.filter((event) => {
      if (event.year > currentYear) return false
      if (selectedFacilityType !== 'ALL' && event.facilityType !== selectedFacilityType) return false
      return true
    })
  }, [data, currentYear, selectedFacilityType])

  const timelineData = useMemo(() => {
    const bucket = new Map()
    filteredEvents.forEach((event) => {
      bucket.set(event.year, (bucket.get(event.year) || 0) + 1)
    })
    return [...bucket.entries()]
      .map(([year, events]) => ({ year, events }))
      .sort((a, b) => a.year - b.year)
  }, [filteredEvents])

  const mapData = useMemo(() => {
    const counts = {}
    filteredEvents.forEach((event) => {
      if (!event.sellerState || !STATE_FIPS[event.sellerState]) return
      counts[event.sellerState] = (counts[event.sellerState] || 0) + 1
    })
    const byFips = {}
    Object.entries(counts).forEach(([abbr, count]) => {
      byFips[STATE_FIPS[abbr]] = count
    })
    const maxCount = Object.values(counts).reduce((acc, count) => Math.max(acc, count), 0)
    return { byFips, maxCount }
  }, [filteredEvents])

  const mapShapes = useMemo(() => {
    const statesFeatureCollection = feature(usStatesGeo, usStatesGeo.objects.states)
    const projection = geoAlbersUsa().fitSize([960, 600], statesFeatureCollection)
    const pathGenerator = geoPath(projection)
    return (statesFeatureCollection.features || []).map((stateFeature) => ({
      id: stateFeature.id,
      name: stateFeature.properties?.name || stateFeature.id,
      path: pathGenerator(stateFeature) || '',
      value: mapData.byFips[stateFeature.id] || 0,
    }))
  }, [mapData.byFips])

  const mapLegend = useMemo(() => buildLegendRanges(mapData.maxCount), [mapData.maxCount])

  const chowTypeData = useMemo(() => {
    const bucket = new Map()
    filteredEvents.forEach((event) => {
      const key = event.chowType || 'Unknown'
      bucket.set(key, (bucket.get(key) || 0) + 1)
    })
    return [...bucket.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
  }, [filteredEvents])

  const facilityOverTime = useMemo(() => {
    const byYear = new Map()
    filteredEvents.forEach((event) => {
      const row = byYear.get(event.year) || { year: event.year }
      row[event.facilityType] = (row[event.facilityType] || 0) + 1
      byYear.set(event.year, row)
    })
    return [...byYear.values()].sort((a, b) => a.year - b.year)
  }, [filteredEvents])

  const inOutStateTrend = useMemo(() => {
    const byYear = new Map()
    filteredEvents.forEach((event) => {
      const row = byYear.get(event.year) || { year: event.year, inState: 0, outOfState: 0, total: 0 }
      row.total += 1
      if (event.isOutOfState) row.outOfState += 1
      else row.inState += 1
      byYear.set(event.year, row)
    })
    return [...byYear.values()]
      .sort((a, b) => a.year - b.year)
      .map((row) => ({
        year: row.year,
        inStatePct: pct(row.inState, row.total),
        outOfStatePct: pct(row.outOfState, row.total),
      }))
  }, [filteredEvents])

  const topAcquirers = useMemo(() => {
    const bucket = new Map()
    filteredEvents.forEach((event) => {
      const key = event.buyerNameClean || 'UNKNOWN BUYER'
      bucket.set(key, (bucket.get(key) || 0) + 1)
    })
    return [...bucket.entries()]
      .map(([buyer, events]) => ({ buyer, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 15)
  }, [filteredEvents])

  if (loading) {
    return <p className="page-loading">Loading consolidation data...</p>
  }

  return (
    <div className="data-page">
      <SectionHeading
        title="Consolidation"
        subtitle="A unified view of U.S. hospital change-of-ownership trends, geography, and concentration."
      />

      <SurfaceCard full>
        <div className="ownership-toolbar">
          <label>
            Through year
            <input
              type="range"
              min={Math.min(...years)}
              max={Math.max(...years)}
              value={currentYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            />
            <span>{currentYear}</span>
          </label>
          <label>
            Facility type
            <select value={selectedFacilityType} onChange={(event) => setSelectedFacilityType(event.target.value)}>
              <option value="ALL">All</option>
              {facilityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filtered events
            <strong>{filteredEvents.length.toLocaleString()}</strong>
          </label>
        </div>
      </SurfaceCard>

      <div className="story-flow">
        <RevealSection
          title="1. Consolidation Timeline"
          subtitle="Total CHOW activity over time shows whether consolidation volume is accelerating."
        >
          <SurfaceCard full>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="events" fill="#1d4ed8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="2. Geographic Heatmap"
          subtitle="Seller-state concentrations reveal where hospitals are most frequently acquired."
        >
          <SurfaceCard full>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                <svg viewBox="0 0 960 600" style={{ width: '100%', height: 'auto' }} role="img" aria-label="US state consolidation heatmap">
                  {mapShapes.map((shape) => (
                    <path
                      key={shape.id}
                      d={shape.path}
                      fill={colorForValue(shape.value, mapData.maxCount)}
                      stroke="#fff"
                      strokeWidth={1}
                    >
                      <title>{`${shape.name}: ${shape.value.toLocaleString()} events`}</title>
                    </path>
                  ))}
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>Legend</div>
                {mapLegend.map((entry) => (
                  <div
                    key={entry.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: '#64748b' }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: entry.color, display: 'inline-block' }} />
                    {entry.label}
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="3. Types of Ownership Changes"
          subtitle="A breakdown of CHOW event categories helps demystify what consolidation includes."
        >
          <SurfaceCard full>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={chowTypeData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="type" width={260} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0891b2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="4. Consolidation by Facility Type Over Time"
          subtitle="Stacked annual totals show which broad facility groups are seeing the most activity."
        >
          <SurfaceCard full>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={facilityOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {facilityTypes.map((type, index) => (
                    <Bar key={type} dataKey={type} stackId="facility" fill={STACK_COLORS[index % STACK_COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="5. In-State vs Out-of-State Acquisitions"
          subtitle="Cross-border acquisition share indicates whether consolidation is local or externally driven."
        >
          <SurfaceCard full>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={inOutStateTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="year" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="inStatePct" name="In-State (%)" stroke="#1d4ed8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="outOfStatePct" name="Out-of-State (%)" stroke="#be185d" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="6. Top 15 Most Aggressive Acquirers"
          subtitle="Organizations with the highest transaction volume are leading concentration pressure."
        >
          <SurfaceCard full>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={440}>
                <BarChart data={topAcquirers} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="buyer" width={320} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="events" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SurfaceCard>
        </RevealSection>
      </div>

      <InsightList
        title="Key Observations"
        items={[
          'Annual CHOW volume captures the macro pace of consolidation.',
          'Seller-state hotspots show where local markets are changing most rapidly.',
          'Top acquirers and out-of-state shares highlight concentration dynamics.',
        ]}
      />
    </div>
  )
}

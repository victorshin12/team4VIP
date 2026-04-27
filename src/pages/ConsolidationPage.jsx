import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
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
const DEFAULT_SIZE_CATEGORIES = [
  'Small (1-49 beds)',
  'Medium (50-99 beds)',
  'Large (100-249 beds)',
  'Mega (250+ beds)',
  'Unknown',
]

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
  const legend = [{ label: '0', color: '#e2e8f0' }]
  let start = 1
  for (let idx = 0; idx < MAP_COLORS.length && start <= maxValue; idx += 1) {
    // Build monotonic bins so small max values do not create duplicate labels.
    const rawEnd = Math.ceil(((idx + 1) / MAP_COLORS.length) * maxValue)
    const end = Math.max(start, Math.min(maxValue, rawEnd))
    legend.push({ label: `${start}-${end}`, color: MAP_COLORS[idx] })
    start = end + 1
  }
  return legend
}

export function ConsolidationPage() {
  const { data, loading } = usePrecomputedData('/precomputed/consolidation.json')
  const years = useMemo(() => data?.years || [], [data])
  const [selectedMapSubtype, setSelectedMapSubtype] = useState('ALL')
  const [selectedTimelineSubtype, setSelectedTimelineSubtype] = useState('ALL')
  const [selectedSizeSubtype, setSelectedSizeSubtype] = useState('ALL')
  const [selectedAcquirerSubtype, setSelectedAcquirerSubtype] = useState('ALL')

  const currentYear = years[years.length - 1]
  const facilitySubtypes = useMemo(() => data?.facilitySubtypes || [], [data])

  const filteredEvents = useMemo(() => {
    if (!data?.events?.length) return []
    return data.events.filter((event) => {
      if (event.year > currentYear) return false
      return true
    })
  }, [data, currentYear])

  const timelineEvents = useMemo(() => {
    if (selectedTimelineSubtype === 'ALL') return filteredEvents
    return filteredEvents.filter((event) => (event.facilitySubtype || 'Unknown Numeric Type') === selectedTimelineSubtype)
  }, [filteredEvents, selectedTimelineSubtype])

  const timelineData = useMemo(() => {
    const bucket = new Map(years.map((year) => [year, 0]))
    timelineEvents.forEach((event) => {
      bucket.set(event.year, (bucket.get(event.year) || 0) + 1)
    })
    return [...bucket.entries()]
      .map(([year, events]) => ({ year, events }))
      .sort((a, b) => a.year - b.year)
  }, [timelineEvents, years])

  const mapFilteredEvents = useMemo(() => {
    if (selectedMapSubtype === 'ALL') return filteredEvents
    return filteredEvents.filter((event) => (event.facilitySubtype || 'Unknown Numeric Type') === selectedMapSubtype)
  }, [filteredEvents, selectedMapSubtype])

  const mapData = useMemo(() => {
    const counts = {}
    mapFilteredEvents.forEach((event) => {
      if (!event.sellerState || !STATE_FIPS[event.sellerState]) return
      counts[event.sellerState] = (counts[event.sellerState] || 0) + 1
    })
    const byFips = {}
    Object.entries(counts).forEach(([abbr, count]) => {
      byFips[STATE_FIPS[abbr]] = count
    })
    const maxCount = Object.values(counts).reduce((acc, count) => Math.max(acc, count), 0)
    return { byFips, maxCount }
  }, [mapFilteredEvents])

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

  const sizeCategoryOrder = data?.sizeCategories || DEFAULT_SIZE_CATEGORIES

  const sizeChartEvents = useMemo(() => {
    if (selectedSizeSubtype === 'ALL') return filteredEvents
    return filteredEvents.filter((event) => (event.facilitySubtype || 'Unknown Numeric Type') === selectedSizeSubtype)
  }, [filteredEvents, selectedSizeSubtype])

  const hospitalSizeDistribution = useMemo(() => {
    const bucket = new Map(sizeCategoryOrder.map((category) => [category, 0]))
    sizeChartEvents.forEach((event) => {
      const key = event.hospitalSizeCategory || 'Unknown'
      bucket.set(key, (bucket.get(key) || 0) + 1)
    })
    return sizeCategoryOrder
      .map((category) => ({
        category,
        count: bucket.get(category) || 0,
      }))
  }, [sizeChartEvents, sizeCategoryOrder])

  const acquirerChartEvents = useMemo(() => {
    if (selectedAcquirerSubtype === 'ALL') return filteredEvents
    return filteredEvents.filter((event) => (event.facilitySubtype || 'Unknown Numeric Type') === selectedAcquirerSubtype)
  }, [filteredEvents, selectedAcquirerSubtype])

  const topAcquirers = useMemo(() => {
    const bucket = new Map()
    acquirerChartEvents.forEach((event) => {
      const key = event.buyerNameClean || 'UNKNOWN BUYER'
      bucket.set(key, (bucket.get(key) || 0) + 1)
    })
    return [...bucket.entries()]
      .map(([buyer, events]) => ({ buyer, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 11)
  }, [acquirerChartEvents])
  const acquirerYAxisWidth = useMemo(() => {
    const longestNameLength = topAcquirers.reduce((max, row) => Math.max(max, String(row.buyer || '').length), 0)
    return Math.min(Math.max(longestNameLength * 7, 210), 520)
  }, [topAcquirers])

  if (loading) {
    return <p className="page-loading">Loading consolidation data...</p>
  }

  return (
    <div className="data-page">
      <SectionHeading
        title="Consolidation"
        subtitle="CMS CHOW transaction data organized to show when and where hospital ownership changes occur, and to identify the organizations and markets driving consolidation."
      />

      <div className="story-flow">
        <RevealSection
          title="1. Consolidation Timeline"
          subtitle="Track CHOW activity over time for all events or a selected facility subtype."
        >
          <SurfaceCard full>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                Facility subtype shown in timeline
                <select value={selectedTimelineSubtype} onChange={(event) => setSelectedTimelineSubtype(event.target.value)}>
                  <option value="ALL">All</option>
                  {facilitySubtypes.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {subtype}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
            <div className="chart-observations">
              <InsightList
                title="Key Observations"
                items={[
                  'High Volatility: The pace of hospital change-of-ownership (CHOW) activity is highly irregular, characterized by sudden peaks and steep drop-offs rather than a steady, predictable trend.',
                  'Significant Spikes: The timeline is dominated by one massive surge in consolidation events, where the transaction volume peaked near 140 before falling back to lower baseline levels.',
                ]}
              />
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="2. Geographic Heatmap"
          subtitle="Seller-state concentrations reveal where hospitals are most frequently acquired, with optional facility subtype filtering."
        >
          <SurfaceCard full>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                Facility subtype shown in heatmap
                <select value={selectedMapSubtype} onChange={(event) => setSelectedMapSubtype(event.target.value)}>
                  <option value="ALL">All</option>
                  {facilitySubtypes.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {subtype}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
            <div className="chart-observations">
              <InsightList
                title="Key Observations"
                items={[
                  'Regional Hotspots: Hospital acquisitions are not evenly distributed across the country; instead, they are heavily concentrated in specific regional markets where the landscape is changing rapidly.',
                  'Leading Seller States: The darkest regions on the map, specifically Texas and California, represent the highest concentration of acquired facilities, falling into the highest legend tier of 57 to 71 events.',
                ]}
              />
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="3. Size of Acquired Hospitals"
          subtitle='The "David vs. Goliath" view: are acquisitions concentrated among small community hospitals or larger centers?'
        >
          <SurfaceCard full>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                Facility subtype shown in chart
                <select value={selectedSizeSubtype} onChange={(event) => setSelectedSizeSubtype(event.target.value)}>
                  <option value="ALL">All</option>
                  {facilitySubtypes.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {subtype}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={hospitalSizeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0891b2" name="CHOW events" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-observations">
              <InsightList
                title="Key Observations"
                items={[
                  'Asymmetrical Targeting: The "David vs. Goliath" distribution reveals that acquisitions are not spread evenly across facility sizes; they are heavily skewed toward one primary size category.',
                  'Volume Disparity: The most targeted facility size category experienced nearly 260 change-of-ownership events, which is double the volume of the least targeted category.',
                ]}
              />
            </div>
          </SurfaceCard>
        </RevealSection>

        <RevealSection
          title="4. Top 11 Most Aggressive Acquirers"
          subtitle="Organizations with the highest transaction volume are leading concentration pressure."
        >
          <SurfaceCard full>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                Facility subtype shown in chart
                <select value={selectedAcquirerSubtype} onChange={(event) => setSelectedAcquirerSubtype(event.target.value)}>
                  <option value="ALL">All</option>
                  {facilitySubtypes.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {subtype}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="chart-wrap" style={{ height: 420, paddingBottom: 24 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topAcquirers} layout="vertical" margin={{ left: 12, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="buyer" width={acquirerYAxisWidth} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="events" fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-observations">
              <InsightList
                title="Key Observations"
                items={[
                  'Top-Heavy Concentration: The pressure of market concentration is being actively driven by a select group of organizations that maintain the highest transaction volumes.',
                  'Key Market Movers: Entities leading this aggressive acquisition trend include Dignity Community Care, Sutter Bay Hospitals, and Prisma Health Upstate.',
                ]}
              />
            </div>
          </SurfaceCard>
        </RevealSection>
      </div>
    </div>
  )
}

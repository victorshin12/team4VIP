import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RevealSection } from '../components/story/RevealSection'
import { InsightList, SectionHeading, SurfaceCard } from '../components/ui/Surface'
import { usePrecomputedData } from '../hooks/usePrecomputedData'

function compactMoney(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  const abs = Math.abs(num)
  if (abs >= 1_000_000_000_000) return `$${(num / 1_000_000_000_000).toFixed(1)}T`
  if (abs >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(0)}B`
  if (abs >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`
  if (abs >= 1_000) return `$${(num / 1_000).toFixed(0)}K`
  return `$${Math.round(num)}`
}

function compactNumber(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  const abs = Math.abs(num)
  if (abs >= 1_000_000_000) return `${Math.round(num / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `${Math.round(num / 1_000_000)}M`
  if (abs >= 1_000) return `${Math.round(num / 1_000)}K`
  return `${Math.round(num)}`
}

function quantile(sortedValues, p) {
  if (!sortedValues.length) return null
  if (sortedValues.length === 1) return sortedValues[0]
  const idx = p * (sortedValues.length - 1)
  const low = Math.floor(idx)
  const high = Math.min(sortedValues.length - 1, low + 1)
  const frac = idx - low
  return sortedValues[low] * (1 - frac) + sortedValues[high] * frac
}

function ScatterBedsUncompTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.96)',
        border: '1px solid #cbd5e1',
        borderRadius: 6,
        padding: '8px 10px',
        fontSize: 12,
        color: '#0f172a',
      }}
    >
      <div><strong>Beds:</strong> {compactNumber(point.x)}</div>
      <div><strong>Uncomp Care:</strong> {compactMoney(point.y)}</div>
    </div>
  )
}

const CPI_U_BY_YEAR = {
  1996: 156.9, 1997: 160.5, 1998: 163.0, 1999: 166.6, 2000: 172.2, 2001: 177.1, 2002: 179.9,
  2003: 184.0, 2004: 188.9, 2005: 195.3, 2006: 201.6, 2007: 207.3, 2008: 215.3, 2009: 214.5,
  2010: 218.1, 2011: 224.9, 2012: 229.6, 2013: 232.9, 2014: 236.7, 2015: 237.0, 2016: 240.0,
  2017: 245.1, 2018: 251.1, 2019: 255.7, 2020: 258.8, 2021: 271.0, 2022: 292.7, 2023: 305.4,
  2024: 314.5,
}

function inflationFactor(year, baseYear) {
  const yearCpi = CPI_U_BY_YEAR[year]
  const baseCpi = CPI_U_BY_YEAR[baseYear]
  if (!yearCpi || !baseCpi) return 1
  return baseCpi / yearCpi
}

export function CostAnalysisPage() {
  const { data, loading, error } = usePrecomputedData('/precomputed/cost_analysis_story.json')
  const metadata = data?.metadata || {}
  const maxYear = metadata.maxYear || 2024
  const availableYears = metadata.availableYears || []
  const [yearFocus, setYearFocus] = useState(Math.min(maxYear, 2022))
  const [adjustForInflation, setAdjustForInflation] = useState(false)

  const macroTrendRaw = data?.macroTrend
  const deliveryShiftRaw = data?.deliveryShift
  const uncompCareTrendRaw = data?.uncompCareTrend

  const sizeVsUncompRaw = useMemo(() => data?.sizeVsUncompByYear?.[String(yearFocus)], [data, yearFocus])
  const occupancyHistogram = useMemo(
    () => data?.occupancyHistogramByYear?.[String(yearFocus)] || [],
    [data, yearFocus],
  )
  const chainCapacity = useMemo(
    () =>
      (data?.chainCapacityByYear?.[String(maxYear)] || []).filter((row) => {
        const label = String(row?.chain || '').trim().toLowerCase()
        if (!label) return false
        if (['na', 'n/a', 'null', 'none', 'unknown', 'not available'].includes(label)) return false
        return Number(row?.beds) > 0
      }),
    [data, maxYear],
  )

  const macroTrend = useMemo(() => {
    const rows = macroTrendRaw || []
    if (!adjustForInflation) return rows
    return rows.map((row) => {
      const factor = inflationFactor(row.year, maxYear)
      return {
        ...row,
        revenue: Math.round(row.revenue * factor),
        cost: Math.round(row.cost * factor),
      }
    })
  }, [macroTrendRaw, adjustForInflation, maxYear])

  const deliveryShift = useMemo(() => {
    const rows = deliveryShiftRaw || []
    if (!adjustForInflation) return rows
    return rows.map((row) => {
      const factor = inflationFactor(row.year, maxYear)
      return {
        ...row,
        inpatient: Math.round(row.inpatient * factor),
        outpatient: Math.round(row.outpatient * factor),
      }
    })
  }, [deliveryShiftRaw, adjustForInflation, maxYear])

  const uncompCareTrend = useMemo(() => {
    const rows = uncompCareTrendRaw || []
    if (!adjustForInflation) return rows
    return rows.map((row) => {
      const factor = inflationFactor(row.year, maxYear)
      return {
        ...row,
        avgUncompCare: Math.round(row.avgUncompCare * factor),
      }
    })
  }, [uncompCareTrendRaw, adjustForInflation, maxYear])

  const sizeVsUncomp = useMemo(() => {
    const rows = sizeVsUncompRaw || []
    const adjustedRows = adjustForInflation
      ? rows.map((row) => ({ ...row, y: Math.round(row.y * inflationFactor(yearFocus, maxYear)) }))
      : rows

    // Remove extreme outliers (1st-99th percentile) so the core pattern is readable.
    if (adjustedRows.length < 30) return adjustedRows

    const xs = adjustedRows.map((row) => row.x).filter(Number.isFinite).sort((a, b) => a - b)
    const ys = adjustedRows.map((row) => row.y).filter(Number.isFinite).sort((a, b) => a - b)
    const xMin = quantile(xs, 0.01)
    const xMax = quantile(xs, 0.99)
    const yMin = quantile(ys, 0.01)
    const yMax = quantile(ys, 0.99)

    if (xMin == null || xMax == null || yMin == null || yMax == null) return adjustedRows

    const filtered = adjustedRows.filter(
      (row) => row.x >= xMin && row.x <= xMax && row.y >= yMin && row.y <= yMax,
    )
    // Prevent "empty year" behavior: if trimming removes too much, keep original points.
    if (filtered.length < Math.max(12, Math.floor(adjustedRows.length * 0.35))) {
      return adjustedRows
    }
    return filtered
  }, [sizeVsUncompRaw, adjustForInflation, yearFocus, maxYear])

  const hasMacro = macroTrend.length > 0
  const hasDelivery = deliveryShift.length > 0
  const hasUncompCareTrend = uncompCareTrend.length > 0
  const hasSizeVsUncomp = sizeVsUncomp.length > 0
  const hasOccupancy = occupancyHistogram.length > 0
  const hasChainCapacity = chainCapacity.length > 0

  if (loading) return <p className="page-loading">Loading precomputed cost analysis...</p>
  if (error) return <p className="page-loading">{error.message || 'Could not load cost analysis dataset.'}</p>

  return (
    <div className="data-page">
      <SectionHeading
        title="Cost Analysis"
        subtitle="HCRIS-based hospital cost report data transformed into trend views of revenue, expense, care burden, and capacity, designed to benchmark financial performance and operational pressure over time."
      />

      <div className="story-flow">
          {hasMacro ? (
            <RevealSection
              title="1. The Macro-Financial Health (Time-Series)"
              subtitle="Annual total revenue and cost trajectory."
            >
              <SurfaceCard full>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={macroTrend} margin={{ top: 24, right: 30, left: 30, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        dataKey="year"
                        tick={{ fill: '#334155' }}
                        minTickGap={24}
                        label={{ value: 'Year', position: 'bottom', offset: 14, fill: '#334155' }}
                      />
                      <YAxis
                        width={100}
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactMoney}
                        label={{
                          value: 'Revenue / Cost (USD)',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 0,
                          dx: 10,
                          dy: 60,
                          fill: '#334155',
                        }}
                      />
                      <Tooltip formatter={(value) => compactMoney(Number(value))} />
                      <Line type="monotone" dataKey="revenue" stroke="#2563eb" dot={false} strokeWidth={2.2} />
                      <Line type="monotone" dataKey="cost" stroke="#0891b2" dot={false} strokeWidth={2.2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-controls">
                  <label className="chart-control chart-control-checkbox">
                    <input
                      type="checkbox"
                      checked={adjustForInflation}
                      onChange={(event) => setAdjustForInflation(event.target.checked)}
                    />
                    <span>Adjust for Inflation ({maxYear})</span>
                  </label>
                </div>
                <InsightList
                  title="Key Observations"
                  items={[
                    'Widening Profit Margin: There is a significant and continuously expanding gap between total hospital revenue and total costs over time.',
                    'Exponential Revenue Growth: While costs have maintained a relatively slow, linear growth trajectory (remaining under $1.5T), total revenue has surged exponentially to approach $6.0T.',
                  ]}
                />
              </SurfaceCard>
            </RevealSection>
          ) : null}

          {hasDelivery ? (
            <RevealSection
              title="2. The Delivery Shift: Inpatient vs. Outpatient Revenue"
              subtitle="Average inpatient and outpatient revenue by year."
            >
              <SurfaceCard full>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={340}>
                    <AreaChart data={deliveryShift} margin={{ top: 24, right: 30, left: 30, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        dataKey="year"
                        tick={{ fill: '#334155' }}
                        minTickGap={24}
                        label={{ value: 'Year', position: 'bottom', offset: 14, fill: '#334155' }}
                      />
                      <YAxis
                        width={100}
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactNumber}
                        label={{
                          value: 'Average Revenue (USD)',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 0,
                          dx: 10,
                          dy: 60,
                          fill: '#334155',
                        }}
                      />
                      <Tooltip />
                      <Area type="monotone" dataKey="inpatient" stackId="rev" stroke="#1d4ed8" fill="#93c5fd" />
                      <Area type="monotone" dataKey="outpatient" stackId="rev" stroke="#0f766e" fill="#99f6e4" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-controls">
                  <label className="chart-control chart-control-checkbox">
                    <input
                      type="checkbox"
                      checked={adjustForInflation}
                      onChange={(event) => setAdjustForInflation(event.target.checked)}
                    />
                    <span>Adjust for Inflation ({maxYear})</span>
                  </label>
                </div>
                <InsightList
                  title="Key Observations"
                  items={[
                    'Consistent Upward Trend: Both inpatient and outpatient average revenues per hospital have shown steady, uninterrupted growth from 1999 through 2023.',
                    'Accelerating Combined Revenue: The stacked growth indicates that average facility revenue is accelerating rapidly in recent years, pushing total average revenues near the 1B mark.',
                  ]}
                />
              </SurfaceCard>
            </RevealSection>
          ) : null}

          {hasUncompCareTrend ? (
            <RevealSection
              title="3. Uncompensated Care Burden Over Time"
              subtitle="Average uncompensated/charity care cost per reporting hospital by year."
            >
              <SurfaceCard full>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={uncompCareTrend} margin={{ top: 24, right: 30, left: 30, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        dataKey="year"
                        tick={{ fill: '#334155' }}
                        minTickGap={24}
                        label={{ value: 'Year', position: 'bottom', offset: 14, fill: '#334155' }}
                      />
                      <YAxis
                        yAxisId="left"
                        width={108}
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactNumber}
                        label={{
                          value: 'Avg Uncomp Care (USD)',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 0,
                          dx: 10,
                          dy: 60,
                          fill: '#334155',
                        }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        width={88}
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactNumber}
                        label={{
                          value: 'Hospitals',
                          angle: 90,
                          position: 'insideRight',
                          offset: 0,
                          dx: -18,
                          fill: '#334155',
                        }}
                      />
                      <Tooltip />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="avgUncompCare"
                        stroke="#2563eb"
                        dot={false}
                        strokeWidth={2.2}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="reportingHospitals"
                        stroke="#0f766e"
                        dot={false}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-controls">
                  <label className="chart-control chart-control-checkbox">
                    <input
                      type="checkbox"
                      checked={adjustForInflation}
                      onChange={(event) => setAdjustForInflation(event.target.checked)}
                    />
                    <span>Adjust for Inflation ({maxYear})</span>
                  </label>
                </div>
                <InsightList
                  title="Key Observations"
                  items={[
                    'Historical Volatility: The average cost of uncompensated and charity care per reporting hospital has fluctuated heavily over the last two decades, typically bouncing between $5M and $10M.',
                    'Recent Sharp Decline: There is a stark, concurrent drop in both the number of reporting hospitals (falling below 3K) and the average uncompensated care burden at the very end of the reporting period.',
                  ]}
                />
              </SurfaceCard>
            </RevealSection>
          ) : null}

          <RevealSection
            title="4. Hospital Size vs. Burden of Uncompensated Care"
            subtitle={`Scatter view for ${yearFocus}.`}
          >
            <SurfaceCard full>
              <div className="chart-wrap">
                {hasSizeVsUncomp ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <ScatterChart margin={{ top: 24, right: 30, left: 30, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Beds"
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactNumber}
                        label={{ value: 'Total Beds', position: 'bottom', offset: 14, fill: '#334155' }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        domain={[0, 'auto']}
                        allowDataOverflow
                        name="Uncompensated Care"
                        width={108}
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactNumber}
                        label={{
                          value: 'Uncomp Care (USD)',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 0,
                          dx: 10,
                          dy: 60,
                          fill: '#334155',
                        }}
                      />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterBedsUncompTooltip />} />
                      <Scatter data={sizeVsUncomp} fill="#0f766e" />
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="page-loading">No scatter data available for {yearFocus}.</p>
                )}
              </div>
              <div className="chart-controls">
                <label className="chart-control">
                  <span>Focus Year</span>
                  <select value={yearFocus} onChange={(event) => setYearFocus(Number(event.target.value))}>
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="chart-control chart-control-checkbox">
                  <input
                    type="checkbox"
                    checked={adjustForInflation}
                    onChange={(event) => setAdjustForInflation(event.target.checked)}
                  />
                  <span>Adjust for Inflation ({maxYear})</span>
                </label>
              </div>
              <InsightList
                title="Key Observations"
                items={[
                  'Baseline Concentration: In 2022, the vast majority of facilities experienced a relatively manageable burden of uncompensated care, clustered heavily below the $20M mark.',
                  'High-Burden Outliers: Despite the dense clustering at the bottom, a distinct minority of outlier hospitals carried disproportionately massive financial burdens, with uncompensated care costs reaching up to $80M.',
                ]}
              />
            </SurfaceCard>
          </RevealSection>

          {hasOccupancy ? (
            <RevealSection
              title="5. Hospital Efficiency: Occupancy Rates"
              subtitle={`Histogram for ${yearFocus}.`}
            >
              <SurfaceCard full>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={occupancyHistogram} margin={{ top: 24, right: 30, left: 30, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fill: '#334155' }}
                        minTickGap={16}
                        label={{ value: 'Occupancy Rate Bucket', position: 'bottom', offset: 14, fill: '#334155' }}
                      />
                      <YAxis
                        width={88}
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactNumber}
                        label={{
                          value: 'Hospital Count',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 0,
                          dx: 10,
                          dy: 60,
                          fill: '#334155',
                        }}
                      />
                      <Tooltip />
                      <Bar dataKey="count" fill="#4338ca" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-controls">
                  <label className="chart-control">
                    <span>Focus Year</span>
                    <select value={yearFocus} onChange={(event) => setYearFocus(Number(event.target.value))}>
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <InsightList
                  title="Key Observations"
                  items={[
                    'Broad Efficiency Spectrum: The 2022 histogram reveals a wide distribution in hospital occupancy rates, indicating that operational efficiency varies drastically from facility to facility rather than clustering around a single industry standard.',
                    'Multiple Frequency Peaks: The distribution features several distinct peaks (with the highest counts nearing 400 hospitals), suggesting common but separate baselines for how different tiers of hospitals manage their capacity.',
                  ]}
                />
              </SurfaceCard>
            </RevealSection>
          ) : null}

          {hasChainCapacity ? (
            <RevealSection
              title="6. The Hospital Monopoly: Largest Chains by Capacity"
              subtitle={`Top chains by total beds in ${maxYear}.`}
            >
              <SurfaceCard full>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={chainCapacity} margin={{ top: 24, right: 30, left: 30, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                      <XAxis
                        dataKey="chain"
                        tick={{ fill: '#334155', fontSize: 10 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        minTickGap={8}
                        height={98}
                        label={{ value: 'Hospital Chains (Top 10)', position: 'bottom', offset: 18, fill: '#334155' }}
                      />
                      <YAxis
                        width={98}
                        tickMargin={10}
                        tick={{ fill: '#334155' }}
                        tickFormatter={compactNumber}
                        label={{
                          value: 'Total Beds',
                          angle: -90,
                          position: 'insideLeft',
                          offset: 0,
                          dx: 10,
                          dy: 60,
                          fill: '#334155',
                        }}
                      />
                      <Tooltip />
                      <Bar dataKey="beds" fill="#1d4ed8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <InsightList
                  title="Key Observations"
                  items={[
                    'Extreme Market Concentration: The chart highlights a top-heavy monopoly in 2023, with HCA vastly outpacing all competitors by maintaining a capacity nearing 32,000 total beds.',
                    'The Competitor Plateau: After the top two networks, capacity drops off steeply into a long tail, where the remaining top 10 chains hold relatively similar, much smaller capacities (around 8,000 beds or fewer).',
                  ]}
                />
              </SurfaceCard>
            </RevealSection>
          ) : null}
      </div>

    </div>
  )
}

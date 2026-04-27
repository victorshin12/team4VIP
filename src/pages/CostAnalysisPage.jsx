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
        subtitle="Precomputed visual narrative of hospital financial health, delivery mix, profitability, care burden, efficiency, and chain concentration."
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
              </SurfaceCard>
            </RevealSection>
          ) : null}
      </div>

      <InsightList
        title="Key Observations"
        items={[
          'All six charts are now driven by precomputed artifacts to keep runtime lightweight.',
          'Macro trend and uncompensated-care burden are stable long-run indicators.',
          'Delivery mix, uncompensated burden, occupancy, and chain scale provide operational depth.',
        ]}
      />
    </div>
  )
}

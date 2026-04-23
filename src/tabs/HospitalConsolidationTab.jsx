import { memo, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TAB_BAR_APPROX_PX } from './tabConstants'

const METRICS = [
  { key: 'ipoprev', label: 'Inpatient Outpatient Revenue (ipoprev)', format: 'money' },
  { key: 'iphosprev', label: 'Inpatient Hospital Revenue (iphosprev)', format: 'money' },
  { key: 'opoprev', label: 'Outpatient Revenue (opoprev)', format: 'money' },
  { key: 'netpatrev', label: 'Net Patient Revenue (netpatrev)', format: 'money' },
  { key: 'totcost', label: 'Total Cost (totcost)', format: 'money' },
  { key: 'margin', label: 'Operating Margin', format: 'pct' },
]

const fmtNum = (value) => Number(value || 0).toLocaleString()
const fmtMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const fmtPct = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`

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

let consolidationCache = null
let consolidationPromise = null

function buildConsolidationData(onProgress) {
  if (consolidationCache) return Promise.resolve(consolidationCache)
  if (consolidationPromise) return consolidationPromise

  consolidationPromise = new Promise((resolve, reject) => {
    fetch('/precomputed/consolidation_effects.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Precomputed consolidation fetch failed (${response.status})`)
        return response.json()
      })
      .then((payload) => {
        if (onProgress) onProgress(payload?.hcrisRowsProcessed || 0)
        consolidationCache = payload
        consolidationPromise = null
        resolve(payload)
      })
      .catch((error) => {
        consolidationPromise = null
        reject(error)
      })
  })

  return consolidationPromise
}

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function formatByType(value, format) {
  if (format === 'pct') return fmtPct(value)
  return fmtMoney(value)
}

function HospitalConsolidationTab() {
  const [data, setData] = useState(() => consolidationCache)
  const [loading, setLoading] = useState(() => consolidationCache == null)
  const [progressRows, setProgressRows] = useState(0)
  const [metricKey, setMetricKey] = useState('ipoprev')

  useEffect(() => {
    if (!loading) return
    let cancelled = false
    buildConsolidationData((rows) => {
      if (!cancelled) setProgressRows(rows)
    })
      .then((nextData) => {
        if (cancelled) return
        setData(nextData)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loading])

  const metric = METRICS.find((m) => m.key === metricKey) || METRICS[0]

  const eventComparisons = useMemo(() => {
    if (!data?.matchedEvents?.length) return []
    return data.matchedEvents
      .map((event) => {
        const preVals = event.preRows.map((r) => r[metric.key]).filter((v) => v != null)
        const postVals = event.postRows.map((r) => r[metric.key]).filter((v) => v != null)
        if (!preVals.length || !postVals.length) return null
        const preAvg = average(preVals)
        const postAvg = average(postVals)
        if (preAvg == null || postAvg == null) return null
        const delta = postAvg - preAvg
        const pctDelta = preAvg !== 0 ? delta / Math.abs(preAvg) : null
        return {
          id: event.id,
          hospital: event.matchedHospitalName,
          eventYear: event.eventYear,
          preAvg,
          postAvg,
          delta,
          pctDelta,
          preN: preVals.length,
          postN: postVals.length,
        }
      })
      .filter(Boolean)
  }, [data, metric.key])

  const summary = useMemo(() => {
    if (!eventComparisons.length) return null
    const preMean = average(eventComparisons.map((e) => e.preAvg))
    const postMean = average(eventComparisons.map((e) => e.postAvg))
    const meanDelta = average(eventComparisons.map((e) => e.delta))
    const meanPctDelta = average(eventComparisons.map((e) => e.pctDelta).filter((v) => v != null))
    return { preMean, postMean, meanDelta, meanPctDelta }
  }, [eventComparisons])

  const prePostData = useMemo(() => {
    if (!summary) return []
    return [
      { label: 'Pre (Y-3 to Y-1)', value: summary.preMean },
      { label: 'Post (Y+1 to Y+3)', value: summary.postMean },
    ]
  }, [summary])

  const yearlyCounts = useMemo(() => {
    const byYear = {}
    eventComparisons.forEach((event) => {
      byYear[event.eventYear] = (byYear[event.eventYear] || 0) + 1
    })
    return Object.entries(byYear)
      .map(([year, count]) => ({ year: Number(year), count }))
      .sort((a, b) => a.year - b.year)
  }, [eventComparisons])

  const deltaDistribution = useMemo(() => {
    if (!eventComparisons.length) return []
    const deltas = eventComparisons.map((e) => e.delta).sort((a, b) => a - b)
    const min = deltas[0]
    const max = deltas[deltas.length - 1]
    if (min === max) return [{ range: formatByType(min, metric.format), count: deltas.length }]
    const bins = 10
    const width = (max - min) / bins
    const counts = Array.from({ length: bins }, () => 0)
    deltas.forEach((value) => {
      const idx = Math.min(bins - 1, Math.floor((value - min) / width))
      counts[idx] += 1
    })
    return counts.map((count, idx) => {
      const start = min + idx * width
      const end = idx === bins - 1 ? max : start + width
      return {
        range: `${formatByType(start, metric.format)} to ${formatByType(end, metric.format)}`,
        count,
      }
    })
  }, [eventComparisons, metric.format])

  const topDeltaRows = useMemo(() => {
    if (!eventComparisons.length) return []
    const best = [...eventComparisons].sort((a, b) => b.delta - a.delta).slice(0, 10).map((r) => ({ ...r, segment: 'Top Positive' }))
    const worst = [...eventComparisons].sort((a, b) => a.delta - b.delta).slice(0, 10).map((r) => ({ ...r, segment: 'Top Negative' }))
    return [...best, ...worst]
  }, [eventComparisons])

  const tableRows = useMemo(() => [...eventComparisons].sort((a, b) => b.eventYear - a.eventYear).slice(0, 25), [eventComparisons])

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
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Loading consolidation analysis...</div>
          <div style={{ fontSize: 13 }}>Parsed HCRIS rows: {fmtNum(progressRows)}</div>
        </div>
      </div>
    )
  }

  if (!data) {
    return <div style={{ padding: 24 }}>Unable to load consolidation datasets.</div>
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
            Hospital Consolidation Effects
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: '#94a3b8', lineHeight: 1.5 }}>
            CHOW buyer events linked to HCRIS hospitals using exact organization/DBA name matching and 3-year pre/post windows (event year excluded)
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="consolidation-metric" style={{ fontSize: 13, color: '#475569', marginRight: 8 }}>
            Outcome metric:
          </label>
          <select
            id="consolidation-metric"
            value={metricKey}
            onChange={(event) => setMetricKey(event.target.value)}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, padding: '8px 10px', backgroundColor: '#fff' }}
          >
            {METRICS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'CHOW Events Processed', value: fmtNum(data.chowEventsProcessed), sub: 'Buyer rows with valid date/name', color: '#2563eb' },
            { label: 'Matched Buyer Events', value: fmtNum(data.matchedEvents.length), sub: 'Exact buyer organization/DBA name match in HCRIS', color: '#059669' },
            { label: 'Valid Pre/Post Events', value: fmtNum(eventComparisons.length), sub: 'At least 1 pre + 1 post observation', color: '#d97706' },
            {
              label: 'Average Delta',
              value: summary ? formatByType(summary.meanDelta, metric.format) : 'N/A',
              sub: summary && summary.meanPctDelta != null ? `Mean % change: ${fmtPct(summary.meanPctDelta)}` : 'Selected metric',
              color: '#7c3aed',
            },
          ].map((kpi) => (
            <div key={kpi.label} style={{ backgroundColor: '#fff', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderTop: `3px solid ${kpi.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '4px 0 2px' }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Card>
            <ChartTitle title="Average Pre vs Post Comparison" subtitle="Compares event-level averages before and after ownership-change year." />
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={prePostData} margin={{ top: 8, right: 20, left: 10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-10} textAnchor="end" height={54} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (metric.format === 'pct' ? fmtPct(v) : fmtMoney(v))} />
                <Tooltip formatter={(v) => formatByType(v, metric.format)} />
                <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              This compares the same hospitals before versus after ownership-change events, excluding the transition year. A higher post bar suggests the selected outcome tends to increase following consolidation.
            </Insight>
          </Card>

          <Card>
            <ChartTitle title="Delta Distribution Across Events" subtitle="How many matched events fall into each post-minus-pre change range." />
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={deltaDistribution} margin={{ top: 8, right: 12, left: 10, bottom: 75 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} angle={-28} textAnchor="end" height={92} interval={0} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              This chart shows whether changes are concentrated near zero or skewed positive/negative. A right-shifted distribution indicates more events with post-period increases in the selected metric.
            </Insight>
          </Card>

          <Card fullWidth>
            <ChartTitle title="Top Positive and Negative Event Deltas" subtitle="Largest post-vs-pre changes among matched hospitals." />
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={topDeltaRows} layout="vertical" margin={{ top: 8, right: 30, left: 30, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => (metric.format === 'pct' ? fmtPct(v) : fmtMoney(v))} />
                <YAxis dataKey="hospital" type="category" width={260} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatByType(v, metric.format)} />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Legend />
                <Bar dataKey="delta" name="Delta (Post - Pre)">
                  {topDeltaRows.map((row) => (
                    <Cell key={row.id} fill={row.delta >= 0 ? '#16a34a' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              Positive bars represent hospitals where the metric rose after ownership change; negative bars represent declines. This highlights heterogeneity, showing that consolidation effects are not uniform across hospitals.
            </Insight>
          </Card>

          <Card>
            <ChartTitle title="Matched Events by Event Year" subtitle="Counts matched buyer events over time for the selected metric window validity." />
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={yearlyCounts} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <Insight>
              This trend indicates where the matched-event sample is concentrated in time. Spikes may reflect periods with more ownership activity or better data overlap across datasets.
            </Insight>
          </Card>

          <Card>
            <ChartTitle title="Sample Matched Event Rows" subtitle="Recent matched hospitals with computed pre/post windows and delta." />
            <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', color: '#475569' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Hospital</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Event Year</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Pre Avg</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Post Avg</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px' }}>{row.hospital}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.eventYear}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatByType(row.preAvg, metric.format)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatByType(row.postAvg, metric.format)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: row.delta >= 0 ? '#059669' : '#dc2626' }}>
                        {formatByType(row.delta, metric.format)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Insight>
              This sample table makes the linkage transparent by showing event year, pre-window average, post-window average, and the resulting change for each matched hospital. It helps verify that exclusion of the event year is working as intended.
            </Insight>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default memo(HospitalConsolidationTab)

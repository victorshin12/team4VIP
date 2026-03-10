import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';

// ─── Constants ───────────────────────────────────────────────
const OWNERSHIP_CATEGORY = {
  1: 'Nonprofit', 2: 'Nonprofit',
  3: 'For-Profit', 4: 'For-Profit', 5: 'For-Profit', 6: 'For-Profit',
  7: 'Government', 8: 'Government', 9: 'Government', 10: 'Government',
  11: 'Government', 12: 'Government', 13: 'Government',
};

// ─── Helpers ─────────────────────────────────────────────────
const fmtNum = (v) => Number(v).toLocaleString();

const Card = ({ children, fullWidth, style }) => (
  <div style={{
    backgroundColor: '#fff', borderRadius: 12, padding: '28px 32px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    gridColumn: fullWidth ? '1 / -1' : undefined, ...style,
  }}>
    {children}
  </div>
);

const ChartTitle = ({ title, subtitle }) => (
  <div style={{ marginBottom: 14 }}>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{title}</h2>
    {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{subtitle}</p>}
  </div>
);

const Insight = ({ children }) => (
  <p style={{
    margin: '16px 0 0', padding: '10px 14px', backgroundColor: '#f8fafc',
    borderLeft: '3px solid #3b82f6', fontSize: 13, lineHeight: 1.6,
    color: '#475569', borderRadius: '0 6px 6px 0',
  }}>
    {children}
  </p>
);

const ScatterTip = ({ payload, fields }) => {
  if (!payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12, maxWidth: 260 }}>
      {d.name && <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.name}</div>}
      {fields.map(([key, label, fmt]) => (
        <div key={key}>{label}: {fmt ? fmt(d[key]) : d[key]}</div>
      ))}
    </div>
  );
};

// ─── Dashboard ───────────────────────────────────────────────
function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Papa.parse('/hcris_hospyear.csv', {
      download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: (results) => {
        const processed = results.data
          .filter(r => r.ayear && r.tottotrev && r.totcost && !isNaN(r.tottotrev) && !isNaN(r.totcost))
          .map(r => {
            const rev = parseFloat(r.tottotrev) || 0;
            const cost = parseFloat(r.totcost) || 0;
            return {
              ...r,
              tottotrev: rev, totcost: cost,
              beds_total: parseFloat(r.beds_total) || 0,
              margin: rev > 0 ? ((rev - cost) / rev) * 100 : 0,
              ownershipCategory: OWNERSHIP_CATEGORY[r.typ_control] || 'Unknown',
            };
          });
        setData(processed);
        setLoading(false);
      },
      error: () => setLoading(false),
    });
  }, []);

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data.length) return null;
    const years = data.map(d => d.ayear).filter(Boolean);
    const minYear = years.reduce((m, y) => y < m ? y : m, years[0]);
    const maxYear = years.reduce((m, y) => y > m ? y : m, years[0]);
    const uniqueHospitals = new Set(data.map(d => d.pn)).size;
    const latest = data.filter(d => d.ayear === maxYear);
    const avgRevLatest = latest.reduce((s, d) => s + d.tottotrev, 0) / latest.length;
    const avgMarginLatest = latest.reduce((s, d) => s + d.margin, 0) / latest.length;
    const totalRevLatest = latest.reduce((s, d) => s + d.tottotrev, 0);
    return { minYear, maxYear, uniqueHospitals, totalRecords: data.length, avgRevLatest, avgMarginLatest, totalRevLatest, latestCount: latest.length };
  }, [data]);

  // ── 1. Yearly Trend ────────────────────────────────────────
  const yearlyTrend = useMemo(() => {
    if (!data.length) return [];
    const by = {};
    data.forEach(r => {
      const y = r.ayear;
      if (!by[y]) by[y] = { year: y, rev: 0, cost: 0, count: 0, marginSum: 0 };
      by[y].rev += r.tottotrev; by[y].cost += r.totcost;
      by[y].marginSum += r.margin; by[y].count += 1;
    });
    return Object.values(by)
      .map(d => ({ year: d.year, revenue: d.rev / 1e9, cost: d.cost / 1e9, avgMargin: d.marginSum / d.count, hospitalCount: d.count }))
      .sort((a, b) => a.year - b.year);
  }, [data]);

  // ── 2. YoY Growth ─────────────────────────────────────────
  const growthData = useMemo(() => {
    if (yearlyTrend.length < 2) return [];
    return yearlyTrend.map((d, i, a) => ({
      year: d.year,
      revenueGrowth: i > 0 ? ((d.revenue - a[i - 1].revenue) / a[i - 1].revenue * 100) : null,
    })).filter(d => d.revenueGrowth !== null);
  }, [yearlyTrend]);

  // ── 3. Ownership Comparison ────────────────────────────────
  const ownershipData = useMemo(() => {
    if (!data.length || !stats) return [];
    const latest = data.filter(d => d.ayear === stats.maxYear);
    const by = {};
    latest.forEach(r => {
      const c = r.ownershipCategory;
      if (c === 'Unknown') return;
      if (!by[c]) by[c] = { category: c, revSum: 0, costSum: 0, marginSum: 0, count: 0 };
      by[c].revSum += r.tottotrev; by[c].costSum += r.totcost;
      by[c].marginSum += r.margin; by[c].count += 1;
    });
    return Object.values(by).map(d => ({
      category: d.category, avgRevenue: d.revSum / d.count / 1e6, avgCost: d.costSum / d.count / 1e6,
      avgMargin: d.marginSum / d.count, count: d.count,
    })).sort((a, b) => b.avgRevenue - a.avgRevenue);
  }, [data, stats]);

  // ── 4. Revenue vs Cost Scatter ─────────────────────────────
  const scatterData = useMemo(() => {
    if (!data.length || !stats) return [];
    return data
      .filter(d => d.ayear === stats.maxYear && d.tottotrev > 0 && d.totcost > 0 && d.tottotrev < 5e9 && d.totcost < 5e9)
      .map(d => ({ revenue: d.tottotrev / 1e6, cost: d.totcost / 1e6, name: d.hospital_name, beds: d.beds_total, category: d.ownershipCategory }));
  }, [data, stats]);

  // ── 5. Bed Distribution ───────────────────────────────────
  const bedDistribution = useMemo(() => {
    if (!data.length || !stats) return [];
    const latest = data.filter(d => d.ayear === stats.maxYear && d.beds_total > 0 && d.beds_total < 1500);
    const bk = {};
    latest.forEach(d => {
      const b = Math.floor(d.beds_total / 100) * 100;
      const key = b === 0 ? '1–99' : `${b}–${b + 99}`;
      if (!bk[key]) bk[key] = { range: key, count: 0, sortKey: b };
      bk[key].count += 1;
    });
    return Object.values(bk).sort((a, b) => a.sortKey - b.sortKey);
  }, [data, stats]);

  // ── 6. Top Hospitals ──────────────────────────────────────
  const topHospitals = useMemo(() => {
    if (!data.length || !stats) return [];
    return data
      .filter(d => d.ayear === stats.maxYear && d.hospital_name)
      .sort((a, b) => b.tottotrev - a.tottotrev)
      .slice(0, 10)
      .map(d => ({
        name: d.hospital_name.length > 35 ? d.hospital_name.substring(0, 35) + '…' : d.hospital_name,
        fullName: d.hospital_name, revenue: d.tottotrev / 1e6, cost: d.totcost / 1e6,
        margin: d.margin, beds: d.beds_total, type: d.ownershipCategory,
      }));
  }, [data, stats]);

  // ── 7. Margin Distribution ────────────────────────────────
  const marginDistribution = useMemo(() => {
    if (!data.length || !stats) return [];
    const latest = data.filter(d => d.ayear === stats.maxYear && d.margin > -100 && d.margin < 100);
    const bk = {};
    latest.forEach(d => {
      const b = Math.floor(d.margin / 5) * 5;
      const key = `${b}% to ${b + 5}%`;
      if (!bk[key]) bk[key] = { range: key, count: 0, sortKey: b, isNegative: b < 0 };
      bk[key].count += 1;
    });
    return Object.values(bk).sort((a, b) => a.sortKey - b.sortKey);
  }, [data, stats]);

  // ── Computed Insights ─────────────────────────────────────
  const insights = useMemo(() => {
    if (!yearlyTrend.length || !stats || !growthData.length) return {};
    const first = yearlyTrend[0]; const last = yearlyTrend[yearlyTrend.length - 1];
    const revGrowthTotal = ((last.revenue - first.revenue) / first.revenue * 100).toFixed(0);
    const costGrowthTotal = ((last.cost - first.cost) / first.cost * 100).toFixed(0);
    const profitableCount = data.filter(d => d.ayear === stats.maxYear && d.margin > 0).length;
    const totalLatest = data.filter(d => d.ayear === stats.maxYear).length;
    const profitablePct = ((profitableCount / totalLatest) * 100).toFixed(1);
    const maxG = growthData.reduce((m, d) => d.revenueGrowth > m.revenueGrowth ? d : m, growthData[0]);
    const minG = growthData.reduce((m, d) => d.revenueGrowth < m.revenueGrowth ? d : m, growthData[0]);
    return { revGrowthTotal, costGrowthTotal, profitablePct, maxG, minG };
  }, [yearlyTrend, growthData, data, stats]);

  // ── Loading / Empty ───────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 18, color: '#64748b', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          Loading hospital cost report data…
        </div>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div style={{ backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '0 0 60px', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <header style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', color: '#fff', padding: '44px 32px 36px', marginBottom: 32 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Hospital Cost Report Analysis
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: '#94a3b8', lineHeight: 1.5 }}>
            HCRIS (Healthcare Cost Report Information System) · {stats.minYear}–{stats.maxYear} · {fmtNum(stats.uniqueHospitals)} unique hospitals · {fmtNum(stats.totalRecords)} hospital-year records
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>

        {/* ── KPI Cards ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Hospitals Tracked', value: fmtNum(stats.uniqueHospitals), sub: `${stats.minYear}–${stats.maxYear}`, color: '#2563eb' },
            { label: `Total Revenue (${stats.maxYear})`, value: `$${(stats.totalRevLatest / 1e12).toFixed(2)}T`, sub: `Across ${fmtNum(stats.latestCount)} hospitals`, color: '#059669' },
            { label: 'Avg Revenue / Hospital', value: `$${(stats.avgRevLatest / 1e6).toFixed(1)}M`, sub: `In ${stats.maxYear}`, color: '#d97706' },
            { label: 'Avg Profit Margin', value: `${stats.avgMarginLatest.toFixed(1)}%`, sub: `In ${stats.maxYear}`, color: stats.avgMarginLatest >= 0 ? '#059669' : '#dc2626' },
          ].map((kpi, i) => (
            <div key={i} style={{
              backgroundColor: '#fff', borderRadius: 12, padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderTop: `3px solid ${kpi.color}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '4px 0 2px' }}>{kpi.value}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Charts Grid ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* ═══ 1. Revenue & Cost Trend (full width) ═══ */}
          <Card fullWidth>
            <ChartTitle title="Total Industry Revenue & Cost Over Time" subtitle="Aggregate annual revenue and cost across all reporting hospitals (in billions of dollars). Orange line shows the number of reporting hospitals each year." />
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={yearlyTrend} margin={{ top: 10, right: 70, left: 25, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tickFormatter={v => `$${v}B`} tick={{ fontSize: 11 }} width={60} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11 }} width={55} />
                <Tooltip formatter={(v, name) => name.includes('Count') ? fmtNum(Math.round(v)) : `$${v.toFixed(1)}B`} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area yAxisId="left" type="monotone" dataKey="revenue" fill="#2563eb" fillOpacity={0.12} stroke="#2563eb" strokeWidth={2} name="Total Revenue ($B)" />
                <Area yAxisId="left" type="monotone" dataKey="cost" fill="#059669" fillOpacity={0.12} stroke="#059669" strokeWidth={2} name="Total Cost ($B)" />
                <Line yAxisId="right" type="monotone" dataKey="hospitalCount" stroke="#d97706" strokeWidth={2} dot={false} name="Hospital Count" />
              </ComposedChart>
            </ResponsiveContainer>
            <Insight>
              📈 Industry revenue grew <strong>{insights.revGrowthTotal}%</strong> from {stats.minYear} to {stats.maxYear}, while costs grew <strong>{insights.costGrowthTotal}%</strong>. The gap between revenue and cost represents the industry's aggregate surplus. Hospital count has remained relatively stable, meaning growth is driven by per-hospital revenue increases — not new facilities.
            </Insight>
          </Card>

          {/* ═══ 2. Average Profit Margin Trend ═══ */}
          <Card>
            <ChartTitle title="Average Profit Margin Trend" subtitle="Mean (revenue − cost) ÷ revenue across all hospitals, by year. The dashed red line marks break-even (0%)." />
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={yearlyTrend} margin={{ top: 10, right: 20, left: 15, bottom: 10 }}>
                <defs>
                  <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${Math.round(Number(v))}%`} tick={{ fontSize: 11 }} width={45} />
                <Tooltip formatter={v => `${Number(v).toFixed(2)}%`} />
                <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="avgMargin" stroke="#2563eb" fill="url(#marginGrad)" strokeWidth={2.5} name="Avg Margin %" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <Insight>
              Margins reflect whether hospitals cover their costs on average. A downward trend indicates rising costs outpacing revenue. Sustained negative margins would signal systemic financial distress across the industry.
            </Insight>
          </Card>

          {/* ═══ 3. YoY Revenue Growth ═══ */}
          <Card>
            <ChartTitle title="Year-over-Year Revenue Growth" subtitle="Annual percentage change in total industry revenue. Red bars indicate years when revenue declined." />
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={growthData} margin={{ top: 10, right: 20, left: 15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${Math.round(Number(v))}%`} tick={{ fontSize: 11 }} width={45} />
                <Tooltip formatter={v => `${Number(v).toFixed(2)}%`} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="revenueGrowth" name="Revenue Growth %" radius={[3, 3, 0, 0]}>
                  {growthData.map((entry, i) => (
                    <Cell key={i} fill={entry.revenueGrowth >= 0 ? '#059669' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              {insights.maxG && insights.minG && (
                <>Revenue grew fastest in <strong>{insights.maxG.year}</strong> (+{insights.maxG.revenueGrowth.toFixed(1)}%) and slowest in <strong>{insights.minG.year}</strong> ({insights.minG.revenueGrowth.toFixed(1)}%). Revenue dips often correlate with economic downturns or major policy shifts.</>
              )}
            </Insight>
          </Card>

          {/* ═══ 4. Ownership Type Comparison (full width) ═══ */}
          <Card fullWidth>
            <ChartTitle
              title={`Average Revenue & Cost by Ownership Type (${stats.maxYear})`}
              subtitle="CMS classifies hospitals into three ownership categories: Nonprofit (voluntary, church-affiliated or other nonprofit), For-Profit (proprietary — corporations, individuals, partnerships), and Government (federal, state, county, city, hospital districts). The gap between blue and gray bars reveals each category's typical surplus or deficit."
            />
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ownershipData} margin={{ top: 10, right: 30, left: 25, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" tick={{ fontSize: 13 }} />
                <YAxis tickFormatter={v => `$${v}M`} tick={{ fontSize: 11 }} width={70} />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.category}</div>
                        <div>Avg Revenue: ${d.avgRevenue.toFixed(1)}M</div>
                        <div>Avg Cost: ${d.avgCost.toFixed(1)}M</div>
                        <div>Avg Margin: {d.avgMargin.toFixed(1)}%</div>
                        <div>Hospitals: {fmtNum(d.count)}</div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="avgRevenue" fill="#2563eb" name="Avg Revenue ($M)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgCost" fill="#94a3b8" name="Avg Cost ($M)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              Nonprofit hospitals tend to have the highest average revenue and are the most numerous. For-profit hospitals often operate with different cost structures. Government hospitals typically serve safety-net roles, which can affect their financial metrics. Hover over bars for margin and count details.
            </Insight>
          </Card>

          {/* ═══ 5. Revenue vs Cost Scatter ═══ */}
          <Card>
            <ChartTitle
              title={`Revenue vs. Cost (${stats.maxYear})`}
              subtitle="Each dot is one hospital. Points above the diagonal spend more than they earn."
            />
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 10, right: 20, left: 15, bottom: 35 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" dataKey="revenue" name="Revenue" tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`} tick={{ fontSize: 11 }}
                  label={{ value: 'Revenue ($M)', position: 'insideBottom', offset: -20, fontSize: 12, fill: '#64748b' }} />
                <YAxis type="number" dataKey="cost" name="Cost" tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`} tick={{ fontSize: 11 }} width={70} />
                <Tooltip content={({ payload }) => (
                  <ScatterTip payload={payload} fields={[
                    ['revenue', 'Revenue', v => `$${v.toFixed(0)}M`],
                    ['cost', 'Cost', v => `$${v.toFixed(0)}M`],
                    ['beds', 'Beds'],
                    ['category', 'Type'],
                  ]} />
                )} />
                <Scatter data={scatterData} fill="#2563eb" fillOpacity={0.35} r={2.5} />
              </ScatterChart>
            </ResponsiveContainer>
            <Insight>
              Most hospitals cluster tightly along the diagonal (revenue ≈ cost), confirming thin industry margins. Hospitals above the line operate at a loss; those below earn a surplus. Outliers far from the cluster deserve further investigation.
            </Insight>
          </Card>

          {/* ═══ 6. Bed Distribution ═══ */}
          <Card>
            <ChartTitle
              title={`Hospital Size Distribution (${stats.maxYear})`}
              subtitle="Number of hospitals by total licensed bed count"
            />
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={bedDistribution} margin={{ top: 10, right: 20, left: 15, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11 }} width={50} />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" name="Hospitals" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              The distribution is heavily right-skewed — the vast majority of U.S. hospitals have fewer than 200 beds. Large medical centers with 500+ beds are relatively rare but account for a disproportionate share of total revenue and patient volume.
            </Insight>
          </Card>

          {/* ═══ 7. Profit Margin Distribution (full width) ═══ */}
          <Card fullWidth>
            <ChartTitle
              title={`Profit Margin Distribution (${stats.maxYear})`}
              subtitle={`How are hospital margins spread? ${insights.profitablePct || '—'}% of hospitals had positive margins. Red = operating at a loss, Green = profitable.`}
            />
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={marginDistribution} margin={{ top: 10, right: 30, left: 15, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="range" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={70} />
                <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11 }} width={50} />
                <Tooltip />
                <Bar dataKey="count" name="Hospitals" radius={[3, 3, 0, 0]}>
                  {marginDistribution.map((e, i) => (
                    <Cell key={i} fill={e.isNegative ? '#fca5a5' : '#86efac'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              🔴 Red bars = hospitals operating at a loss · 🟢 Green bars = profitable hospitals. About <strong>{insights.profitablePct || '—'}%</strong> had positive margins in {stats.maxYear}. The shape of this distribution reveals whether the industry is broadly healthy or if a large tail of struggling hospitals exists.
            </Insight>
          </Card>

          {/* ═══ 8. Top 10 Hospitals (full width) ═══ */}
          <Card fullWidth>
            <ChartTitle
              title={`Top 10 Hospitals by Revenue (${stats.maxYear})`}
              subtitle="The largest hospitals by total revenue. Blue = revenue, gray = cost. The gap shows each hospital's margin."
            />
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={topHospitals} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={230} tick={{ fontSize: 11 }} />
                <Tooltip content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12, maxWidth: 280 }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.fullName}</div>
                      <div>Revenue: ${d.revenue.toFixed(0)}M</div>
                      <div>Cost: ${d.cost.toFixed(0)}M</div>
                      <div>Margin: {d.margin.toFixed(1)}%</div>
                      <div>Beds: {fmtNum(d.beds)} · {d.type}</div>
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" fill="#2563eb" name="Revenue ($M)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="cost" fill="#b0b8c4" name="Cost ($M)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Insight>
              The top hospitals by revenue are predominantly large academic medical centers and integrated health systems. The gap between blue (revenue) and gray (cost) bars shows each hospital's financial cushion. A small gap means thin margins despite enormous volume.
            </Insight>
          </Card>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div style={{ marginTop: 36, padding: '22px 28px', backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
          <strong style={{ color: '#1e293b' }}>About this data:</strong> This dashboard visualizes the Healthcare Cost Report Information System (HCRIS) dataset, containing financial and operational data reported by Medicare-certified hospitals to the Centers for Medicare &amp; Medicaid Services (CMS). All dollar figures are nominal (not inflation-adjusted). Profit margin = (Total Revenue − Total Cost) / Total Revenue. Ownership types follow CMS control-type codes (1–13). Data sourced from the publicly available HCRIS hospital-year file.
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

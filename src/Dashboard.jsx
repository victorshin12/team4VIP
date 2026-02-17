import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);

  useEffect(() => {
    Papa.parse('/hcris_hospyear.csv', {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Filter out rows with invalid data and convert numeric fields
        const processed = results.data
          .filter(row => row.ayear && row.tottotrev && row.totcost && !isNaN(row.tottotrev) && !isNaN(row.totcost))
          .map(row => ({
            ...row,
            tottotrev: parseFloat(row.tottotrev) || 0,
            totcost: parseFloat(row.totcost) || 0,
            beds_total: parseFloat(row.beds_total) || 0,
            ipdischarges_adultped: parseFloat(row.ipdischarges_adultped) || 0,
            margin: ((parseFloat(row.tottotrev) - parseFloat(row.totcost)) / parseFloat(row.tottotrev)) * 100 || 0
          }));
        setData(processed);
        setLoading(false);
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        setLoading(false);
        alert('Error loading CSV file. Please ensure hcris_hospyear.csv is in the public folder.');
      }
    });
  }, []);

  // Memoize all data processing to prevent recalculation on every render
  const yearlyTrend = useMemo(() => {
    if (!data.length) return [];
    const revenueByYear = data.reduce((acc, row) => {
      const year = row.ayear;
      if (!acc[year]) {
        acc[year] = { year, totalRevenue: 0, totalCost: 0, count: 0 };
      }
      acc[year].totalRevenue += row.tottotrev || 0;
      acc[year].totalCost += row.totcost || 0;
      acc[year].count += 1;
      return acc;
    }, {});

    return Object.values(revenueByYear)
      .map(d => ({
        year: d.year,
        revenue: d.totalRevenue / 1e9, // Convert to billions
        cost: d.totalCost / 1e9,
        avgRevenue: d.totalRevenue / d.count / 1e6, // Average per hospital in millions
        hospitalCount: d.count
      }))
      .sort((a, b) => a.year - b.year);
  }, [data]);

  // Top hospitals by revenue (latest year)
  const { latestYear, topHospitals } = useMemo(() => {
    if (!data.length) return { latestYear: null, topHospitals: [] };
    const years = data.map(d => d.ayear).filter(y => y != null);
    const latest = years.length > 0 ? years.reduce((max, y) => y > max ? y : max, years[0]) : null;
    
    const top = latest ? data
      .filter(d => d.ayear === latest && d.hospital_name)
      .sort((a, b) => (b.tottotrev || 0) - (a.tottotrev || 0))
      .slice(0, 10)
      .map(d => ({
        name: d.hospital_name.substring(0, 30) + (d.hospital_name.length > 30 ? '...' : ''),
        revenue: (d.tottotrev || 0) / 1e6, // Millions
        cost: (d.totcost || 0) / 1e6,
        margin: d.margin
      })) : [];
    
    return { latestYear: latest, topHospitals: top };
  }, [data]);

  // Revenue vs Cost scatter
  const revenueCostScatter = useMemo(() => {
    if (!data.length) return [];
    return data
      .filter(d => d.tottotrev > 0 && d.totcost > 0 && d.tottotrev < 5e9 && d.totcost < 5e9)
      .slice(0, 1000) // Sample for performance
      .map(d => ({
        revenue: d.tottotrev / 1e6,
        cost: d.totcost / 1e6,
        beds: d.beds_total
      }));
  }, [data]);

  // Bed capacity distribution
  const bedDistributionData = useMemo(() => {
    if (!data.length) return [];
    const bedDistribution = data
      .filter(d => d.beds_total > 0 && d.beds_total < 2000)
      .reduce((acc, d) => {
        const range = Math.floor(d.beds_total / 50) * 50;
        const key = `${range}-${range + 49}`;
        if (!acc[key]) acc[key] = 0;
        acc[key] += 1;
        return acc;
      }, {});

    return Object.entries(bedDistribution)
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => parseInt(a.range) - parseInt(b.range))
      .slice(0, 15);
  }, [data]);

  // Revenue by hospital type (control type)
  const typeData = useMemo(() => {
    if (!data.length) return [];
    const revenueByType = data.reduce((acc, row) => {
      const type = row.typ_control || 'Unknown';
      if (!acc[type]) {
        acc[type] = { type: `Type ${type}`, revenue: 0, count: 0 };
      }
      acc[type].revenue += row.tottotrev || 0;
      acc[type].count += 1;
      return acc;
    }, {});

    return Object.values(revenueByType)
      .map(d => ({
        ...d,
        avgRevenue: d.revenue / d.count / 1e6
      }))
      .sort((a, b) => b.avgRevenue - a.avgRevenue)
      .slice(0, 8);
  }, [data]);

  // Efficiency metrics (revenue per bed)
  const efficiencyTrend = useMemo(() => {
    if (!data.length) return [];
    const efficiencyData = data
      .filter(d => d.beds_total > 0 && d.tottotrev > 0)
      .map(d => ({
        year: d.ayear,
        revenuePerBed: (d.tottotrev / d.beds_total) / 1000, // Thousands per bed
        beds: d.beds_total
      }))
      .reduce((acc, d) => {
        if (!acc[d.year]) {
          acc[d.year] = { year: d.year, total: 0, count: 0 };
        }
        acc[d.year].total += d.revenuePerBed;
        acc[d.year].count += 1;
        return acc;
      }, {});

    return Object.values(efficiencyData)
      .map(d => ({
        year: d.year,
        avgRevenuePerBed: d.total / d.count
      }))
      .sort((a, b) => a.year - b.year);
  }, [data]);

  // Discharges vs Revenue
  const dischargesData = useMemo(() => {
    if (!data.length) return [];
    return data
      .filter(d => d.ipdischarges_adultped > 0 && d.tottotrev > 0)
      .slice(0, 500)
      .map(d => ({
        discharges: d.ipdischarges_adultped,
        revenue: d.tottotrev / 1e6
      }));
  }, [data]);

  // Year-over-year growth data
  const growthData = useMemo(() => {
    if (!yearlyTrend.length) return [];
    return yearlyTrend.map((d, i, arr) => ({
      ...d,
      growth: i > 0 ? ((d.revenue - arr[i-1].revenue) / arr[i-1].revenue * 100) : 0
    }));
  }, [yearlyTrend]);

  // Data summary stats
  const dataStats = useMemo(() => {
    if (!data.length) return { minYear: null, maxYear: null, hospitalCount: 0 };
    const years = data.map(d => d.ayear).filter(y => y != null);
    const minYear = years.length > 0 ? years.reduce((min, y) => y < min ? y : min, years[0]) : null;
    const maxYear = years.length > 0 ? years.reduce((max, y) => y > max ? y : max, years[0]) : null;
    const hospitalCount = new Set(data.map(d => d.pn)).size;
    return { minYear, maxYear, hospitalCount };
  }, [data]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '20px'
      }}>
        Loading hospital cost data...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '30px' }}>
        Hospital Cost Report Visualization Dashboard
      </h1>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))',
        gap: '20px',
        marginBottom: '20px'
      }}>
        {/* 1. Revenue & Cost Trend Over Time */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Revenue & Cost Trends (1997-2020)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={yearlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis yAxisId="left" label={{ value: 'Billions ($)', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="right" orientation="right" label={{ value: 'Hospitals', angle: 90, position: 'insideRight' }} />
              <Tooltip />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="revenue" fill="#8884d8" fillOpacity={0.6} stroke="#8884d8" name="Total Revenue (Billions)" />
              <Area yAxisId="left" type="monotone" dataKey="cost" fill="#82ca9d" fillOpacity={0.6} stroke="#82ca9d" name="Total Cost (Billions)" />
              <Line yAxisId="right" type="monotone" dataKey="hospitalCount" stroke="#ff7300" strokeWidth={2} name="Hospital Count" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Top Hospitals by Revenue */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Top 10 Hospitals by Revenue ({latestYear})</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topHospitals} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" label={{ value: 'Revenue (Millions $)', position: 'insideBottom', offset: -5 }} />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" fill="#0088FE" name="Revenue (Millions)" />
              <Bar dataKey="cost" fill="#00C49F" name="Cost (Millions)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 3. Revenue vs Cost Scatter Plot */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Revenue vs Cost Relationship</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart data={revenueCostScatter}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="revenue" name="Revenue" unit="M$" label={{ value: 'Revenue (Millions $)', position: 'insideBottom', offset: -5 }} />
              <YAxis type="number" dataKey="cost" name="Cost" unit="M$" label={{ value: 'Cost (Millions $)', angle: -90, position: 'insideLeft' }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Hospitals" data={revenueCostScatter} fill="#8884d8" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* 4. Bed Capacity Distribution */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Hospital Bed Capacity Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bedDistributionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" angle={-45} textAnchor="end" height={80} />
              <YAxis label={{ value: 'Number of Hospitals', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="count" fill="#FF8042" name="Hospitals" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 5. Revenue by Hospital Type */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Average Revenue by Hospital Type</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ type, percent }) => `${type}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="avgRevenue"
                nameKey="type"
              >
                {typeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 6. Revenue Efficiency Trend (Revenue per Bed) */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Average Revenue per Bed Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={efficiencyTrend}>
              <defs>
                <linearGradient id="colorEfficiency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis label={{ value: 'Revenue per Bed (Thousands $)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Area type="monotone" dataKey="avgRevenuePerBed" stroke="#8884d8" fillOpacity={1} fill="url(#colorEfficiency)" name="Revenue/Bed (K$)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 7. Discharges vs Revenue */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Inpatient Discharges vs Revenue</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart data={dischargesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="discharges" name="Discharges" label={{ value: 'Inpatient Discharges', position: 'insideBottom', offset: -5 }} />
              <YAxis type="number" dataKey="revenue" name="Revenue" unit="M$" label={{ value: 'Revenue (Millions $)', angle: -90, position: 'insideLeft' }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Hospitals" data={dischargesData} fill="#82ca9d" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* 8. Year-over-Year Growth */}
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#444' }}>Year-over-Year Revenue Growth</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis label={{ value: 'Growth %', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line type="monotone" dataKey="growth" stroke="#ff7300" strokeWidth={3} dot={{ r: 4 }} name="YoY Growth %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginTop: '20px'
      }}>
        <h2 style={{ marginTop: 0, color: '#444' }}>Data Summary</h2>
        <p><strong>Total Records:</strong> {data.length.toLocaleString()}</p>
        <p><strong>Year Range:</strong> {dataStats.minYear != null ? `${dataStats.minYear} - ${dataStats.maxYear}` : 'N/A'}</p>
        <p><strong>Total Hospitals:</strong> {dataStats.hospitalCount.toLocaleString()}</p>
        <p><strong>Average Revenue (Latest Year):</strong> ${(yearlyTrend[yearlyTrend.length - 1]?.avgRevenue || 0).toFixed(2)}M per hospital</p>
      </div>
    </div>
  );
}

export default Dashboard;

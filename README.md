# Hospital Cost Report Visualization Dashboard

A React application for visualizing hospital cost report data (HCRIS) with multiple interactive charts and graphs.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Copy the CSV file to the public folder:**
   ```bash
   cp /Users/victorshin/Downloads/hospital-cost-report/hcris_hospyear.csv public/
   ```
   Or manually copy `hcris_hospyear.csv` to the `public/` directory.

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## Features

The dashboard includes 8 different visualizations:

1. **Revenue & Cost Trends** - Area chart showing total revenue and cost over time (1997-2020)
2. **Top Hospitals by Revenue** - Horizontal bar chart of top 10 hospitals
3. **Revenue vs Cost Relationship** - Scatter plot showing correlation
4. **Bed Capacity Distribution** - Bar chart of hospital bed size distribution
5. **Revenue by Hospital Type** - Pie chart showing average revenue by control type
6. **Revenue Efficiency Trend** - Area chart of revenue per bed over time
7. **Discharges vs Revenue** - Scatter plot of inpatient discharges vs revenue
8. **Year-over-Year Growth** - Line chart showing revenue growth percentage

## Technologies

- React 19
- Vite
- Recharts (for visualizations)
- PapaParse (for CSV parsing)

## Data Source

HCRIS (Healthcare Cost Report Information System) hospital-year aggregated data.

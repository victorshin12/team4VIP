# Healthcare Dashboard

Interactive React dashboard for:
- Hospital cost reports (HCRIS)
- Change of ownership (CHOW)
- Medicare Part B physician/professional services by geography (MUP)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Place source CSVs in `public/`:
   - `hcris_hospyear.csv`
   - `Hospital_CHOW_2026.01.02.csv`
   - `MUP_PHY_R25_P05_V20_D23_Geo.csv`

3. Generate precomputed data artifacts:
   ```bash
   npm run precompute:data
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Precompute Workflow

This project uses a precompute pipeline so the browser does not parse very large CSV files at runtime.

- Script: `scripts/precompute_data.py`
- Command: `npm run precompute:data`
- Outputs:
  - `public/precomputed/hospital_cost_report.json`
  - `public/precomputed/change_ownership.json`
  - `public/precomputed/mup_geo_services.json`
  - `public/precomputed/consolidation_effects.json`

Run the precompute command whenever source CSVs change, and before production deploy/build.

## Deployment Note

If raw CSVs are too large for Git hosting, keep them outside Git and generate/version only `public/precomputed/*.json` artifacts for deployment.

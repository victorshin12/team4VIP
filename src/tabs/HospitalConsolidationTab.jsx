import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TAB_BAR_APPROX_PX } from './tabConstants'
import './HospitalConsolidationTab.css'

function toCleanString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getYearFromEffectiveDate(raw) {
  const s = toCleanString(raw)
  if (!s) return null

  // Excel serial date (common when exporting from spreadsheets).
  // Excel's epoch is typically 1899-12-30 for serials in modern exports.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n)) {
      // If it looks like a year already.
      if (n >= 1900 && n <= 2100) return Math.trunc(n)
      // If it looks like an Excel serial day number.
      if (n >= 20000 && n <= 80000) {
        const d = new Date(Date.UTC(1899, 11, 30) + Math.trunc(n) * 86400000)
        const y = d.getUTCFullYear()
        if (y >= 1900 && y <= 2100) return y
      }
    }
  }

  // YYYYMMDD (e.g., 20260115)
  const yyyymmdd = s.match(/\b(19|20)\d{2}(0[1-9]|1[0-2])([0-2]\d|3[01])\b/)
  if (yyyymmdd) return Number(yyyymmdd[0].slice(0, 4))

  // MM/DD/YY or MM/DD/YYYY (and variants with '-' instead of '/')
  const mdY = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (mdY) {
    const yr = mdY[3]
    if (yr.length === 4) return Number(yr)
    const two = Number(yr)
    if (Number.isFinite(two)) return two <= 49 ? 2000 + two : 1900 + two
  }

  // ISO-ish YYYY-MM-DD or strings containing a 4-digit year.
  const m = s.match(/\b(19|20)\d{2}\b/)
  if (m) return Number(m[0])

  // Last resort: Date.parse
  const t = Date.parse(s)
  if (!Number.isNaN(t)) {
    const y = new Date(t).getFullYear()
    if (y >= 1900 && y <= 2100) return y
  }

  return null
}

function parseEffectiveDateToTimestamp(raw) {
  const s = toCleanString(raw)
  if (!s) return null

  // Excel serial date (day number)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n)) {
      // If it looks like YYYY.
      if (n >= 1900 && n <= 2100) return Date.UTC(Math.trunc(n), 0, 1)
      // If it looks like an Excel serial day number.
      if (n >= 20000 && n <= 80000) return Date.UTC(1899, 11, 30) + Math.trunc(n) * 86400000
    }
  }

  // YYYYMMDD
  const yyyymmdd = s.match(/\b(19|20)\d{2}(0[1-9]|1[0-2])([0-2]\d|3[01])\b/)
  if (yyyymmdd) {
    const y = Number(s.slice(0, 4))
    const m = Number(s.slice(4, 6))
    const d = Number(s.slice(6, 8))
    return Date.UTC(y, m - 1, d)
  }

  // MM/DD/YY or MM/DD/YYYY (or with '-')
  const mdY = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (mdY) {
    const mm = Number(mdY[1])
    const dd = Number(mdY[2])
    const yr = mdY[3]
    const yyyy = yr.length === 4 ? Number(yr) : Number(yr) <= 49 ? 2000 + Number(yr) : 1900 + Number(yr)
    if (Number.isFinite(mm) && Number.isFinite(dd) && Number.isFinite(yyyy)) return Date.UTC(yyyy, mm - 1, dd)
  }

  const t = Date.parse(s)
  if (!Number.isNaN(t)) return t
  return null
}

function formatDateYmd(ts) {
  if (!Number.isFinite(ts)) return 'N/A'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 'N/A'
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function increment(map, key, by = 1) {
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + by)
}

function mapToSortedArray(
  map,
  { keyName = 'key', valueName = 'count', desc = true, numericKeys = false } = {}
) {
  const arr = Array.from(map.entries()).map(([key, count]) => ({ [keyName]: key, [valueName]: count }))
  arr.sort((a, b) => {
    const av = a[valueName]
    const bv = b[valueName]
    if (av !== bv) return desc ? bv - av : av - bv

    const ak = a[keyName]
    const bk = b[keyName]
    if (numericKeys) {
      const an = Number(ak)
      const bn = Number(bk)
      if (Number.isFinite(an) && Number.isFinite(bn)) {
        return desc ? bn - an : an - bn
      }
    }

    return desc ? String(bk).localeCompare(String(ak)) : String(ak).localeCompare(String(bk))
  })
  return arr
}

function detectDelimiterFromHeader(csvText) {
  const firstNonEmptyLine =
    toCleanString(csvText)
      .split(/\r?\n/)
      .find((l) => toCleanString(l)) ?? ''

  const candidates = [',', '\t', ';', '|']
  let best = { delim: ',', fields: 1 }

  for (const delim of candidates) {
    const fields = firstNonEmptyLine.split(delim).length
    if (fields > best.fields) best = { delim, fields }
  }

  return best.delim
}

function parseWithPapa(csvText, delimiter) {
  return Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    ...(delimiter ? { delimiter } : {}),
  })
}

function isNonFatalPapaWarning(err) {
  const msg = String(err?.message ?? '').toLowerCase()
  return msg.includes('auto-detect delimiting character')
}

function hasFatalErrors(parsed) {
  const errs = parsed?.errors ?? []
  return errs.some((e) => !isNonFatalPapaWarning(e))
}

function tryParseCsv(csvText) {
  // Try auto-detect first (best when the file is well-formed).
  const attempts = [undefined, detectDelimiterFromHeader(csvText), ',', '\t', ';', '|']

  for (const delim of attempts) {
    const parsed = parseWithPapa(csvText, delim)
    if (!hasFatalErrors(parsed)) return { parsed, delimiterUsed: delim ?? 'auto' }
  }

  // Fall back to the last attempt's output for error reporting.
  const last = parseWithPapa(csvText, attempts[attempts.length - 1])
  return { parsed: last, delimiterUsed: attempts[attempts.length - 1] ?? 'auto' }
}

function normalizeHeaderKey(s) {
  return toCleanString(s).toLowerCase().replace(/\s+/g, ' ')
}

function findColumnKey(rows, desiredKey) {
  const first = rows?.[0]
  if (!first || typeof first !== 'object') return null

  const desired = normalizeHeaderKey(desiredKey)
  const keys = Object.keys(first)
  for (const k of keys) {
    const nk = normalizeHeaderKey(toCleanString(k).replace(/^\ufeff/, ''))
    if (nk === desired) return k
  }
  return null
}

/** Logical HCRIS beds grand total column (CHOW−1 reporting year row). */
const HCRIS_COLUMN_BEDS_GRANDTOTAL = 'beds_grandtotal'

const HCRIS_BEDS_GRANDTOTAL_ALIASES = [
  'beds_grandtotal',
  'BEDS_GRANDTOTAL',
  'beds_grand_total',
  'grandtotalbeds',
  'grand_total_beds',
  'grandtotalbed',
  'GRANDTOTALBEDS',
]

function resolvePublicUrl(filename) {
  return new URL(filename, window.location.origin + import.meta.env.BASE_URL).toString()
}

/**
 * Resolve the physical CSV header key for a logical HCRIS column name.
 * Uses Papa `meta.fields` when present, then `findColumnKey` on the row.
 */
function identifyHcrisLogicalColumnKey(row, papaMetaFields, logicalColumnName) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const want = normalizeHeaderKey(logicalColumnName)

  if (Array.isArray(papaMetaFields) && papaMetaFields.length > 0) {
    const headerHas = papaMetaFields.some(
      (f) => normalizeHeaderKey(toCleanString(String(f).replace(/^\ufeff/, ''))) === want
    )
    if (headerHas) {
      const hit = Object.keys(row).find(
        (k) => normalizeHeaderKey(toCleanString(String(k).replace(/^\ufeff/, ''))) === want
      )
      if (hit) return hit
    }
  }

  return findColumnKey([row], logicalColumnName)
}

function identifyHcrisBedsGrandtotalColumnKey(row, papaMetaFields) {
  for (const logical of HCRIS_BEDS_GRANDTOTAL_ALIASES) {
    const k = identifyHcrisLogicalColumnKey(row, papaMetaFields, logical)
    if (k) return k
  }
  return null
}

/** Total total revenue (hospital-year extract), read at CHOW−1 reporting year. */
const HCRIS_COLUMN_TOTTOTREV = 'tottotrev'

const HCRIS_TOTTOTREV_ALIASES = [
  'tottotrev',
  'TOTTOTREV',
  'tot_tot_rev',
  'TOT_TOT_REV',
  'total_total_revenue',
  'TOTAL_TOTAL_REVENUE',
]

function identifyHcrisTotTotRevColumnKey(row, papaMetaFields) {
  for (const logical of HCRIS_TOTTOTREV_ALIASES) {
    const k = identifyHcrisLogicalColumnKey(row, papaMetaFields, logical)
    if (k) return k
  }
  return null
}

/** Operating expense (`opexp`), read at CHOW−1 reporting year. */
const HCRIS_COLUMN_OPEXP = 'opexp'

const HCRIS_OPEXP_ALIASES = ['opexp', 'OPEXP', 'op_exp', 'OP_EXP', 'operating_expense', 'OPERATING_EXPENSE']

function identifyHcrisOpexpColumnKey(row, papaMetaFields) {
  for (const logical of HCRIS_OPEXP_ALIASES) {
    const k = identifyHcrisLogicalColumnKey(row, papaMetaFields, logical)
    if (k) return k
  }
  return null
}

/** Net patient revenue (`netpatrev`) and total beds (`beds_total`) for revenue-per-bed analysis. */
const HCRIS_COLUMN_NETPATREV = 'netpatrev'
const HCRIS_COLUMN_BEDS_TOTAL = 'beds_total'

const HCRIS_NETPATREV_ALIASES = ['netpatrev', 'NETPATREV', 'net_pat_rev', 'NET_PAT_REV', 'net_patient_revenue', 'NET_PATIENT_REVENUE']
const HCRIS_BEDS_TOTAL_ALIASES = ['beds_total', 'BEDS_TOTAL', 'beds_tot', 'BEDS_TOT', 'total_beds', 'TOTAL_BEDS']

function identifyHcrisNetPatRevColumnKey(row, papaMetaFields) {
  for (const logical of HCRIS_NETPATREV_ALIASES) {
    const k = identifyHcrisLogicalColumnKey(row, papaMetaFields, logical)
    if (k) return k
  }
  return null
}

function identifyHcrisBedsTotalColumnKey(row, papaMetaFields) {
  for (const logical of HCRIS_BEDS_TOTAL_ALIASES) {
    const k = identifyHcrisLogicalColumnKey(row, papaMetaFields, logical)
    if (k) return k
  }
  return null
}

/** Resolve the on-disk header name from Papa `meta.fields` before row keys are stable. */
function resolveHcrisPhysicalKeyFromMetaFields(papaMetaFields, aliases) {
  if (!Array.isArray(papaMetaFields) || papaMetaFields.length === 0) return null
  for (const logical of aliases) {
    const want = normalizeHeaderKey(logical)
    const found = papaMetaFields.find(
      (f) => normalizeHeaderKey(toCleanString(String(f).replace(/^\ufeff/, ''))) === want
    )
    if (found != null && toCleanString(String(found)) !== '') {
      return toCleanString(String(found).replace(/^\ufeff/, ''))
    }
  }
  return null
}

/**
 * When `meta.fields` and `Object.keys(row)` disagree (casing/BOM), find the row key that normalizes like `preferred`.
 */
function resolveHcrisRowFieldKey(row, preferred) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || !preferred) return preferred
  if (Object.prototype.hasOwnProperty.call(row, preferred)) return preferred
  const want = normalizeHeaderKey(toCleanString(String(preferred).replace(/^\ufeff/, '')))
  const hit = Object.keys(row).find(
    (k) => normalizeHeaderKey(toCleanString(String(k).replace(/^\ufeff/, ''))) === want
  )
  return hit ?? preferred
}

function parseIntegerishCell(raw) {
  const s = toCleanString(raw)
  let v = parseLooseNumber(s)
  if (!Number.isFinite(v) && s !== '') {
    const n = Number(s.replace(/,/g, ''))
    if (Number.isFinite(n)) v = n
  }
  return v
}

/** `beds_grandtotal` on a row: match resolve-then-fallbacks used for CHOW−1 and per-year merge. */
function readHcrisGrandTotalBedsForRow(r, physicalKey) {
  if (!r || !physicalKey) return null
  const k = resolveHcrisRowFieldKey(r, physicalKey)
  if (k != null && k !== '') {
    const v = parseIntegerishCell(r?.[k])
    if (Number.isFinite(v)) return v
  }
  const v2 = parseIntegerishCell(r?.[physicalKey])
  return Number.isFinite(v2) ? v2 : null
}

function readHcrisNumericForRow(r, physicalKey) {
  if (!r || !physicalKey) return null
  const k = resolveHcrisRowFieldKey(r, physicalKey)
  if (k != null && k !== '') {
    const v = parseLooseNumber(toCleanString(r?.[k]))
    if (Number.isFinite(v)) return v
  }
  const v2 = parseLooseNumber(toCleanString(r?.[physicalKey]))
  return Number.isFinite(v2) ? v2 : null
}

function readHcrisBedsTotalForRow(r, physicalKey) {
  if (!r || !physicalKey) return null
  const k = resolveHcrisRowFieldKey(r, physicalKey)
  if (k != null && k !== '') {
    const v = parseIntegerishCell(r?.[k])
    if (Number.isFinite(v)) return v
  }
  const v2 = parseIntegerishCell(r?.[physicalKey])
  return Number.isFinite(v2) ? v2 : null
}

function truncateMiddle(s, maxLen = 40) {
  const str = toCleanString(s)
  if (!str) return ''
  if (str.length <= maxLen) return str
  const head = Math.max(14, Math.floor((maxLen - 3) * 0.62))
  const tail = Math.max(8, maxLen - 3 - head)
  return `${str.slice(0, head)}...${str.slice(-tail)}`
}

function estimateTickColumnWidthPx(labelStrings, { fontSize = 12, padding = 18 } = {}) {
  const longest = labelStrings.reduce((m, s) => Math.max(m, toCleanString(s).length), 0)
  // Rough canvas width estimate for sans text at small sizes; good enough for axis gutter tuning.
  return Math.ceil(longest * (fontSize * 0.62) + padding)
}

function fmtMoneyMillions(v) {
  if (!Number.isFinite(v)) return 'N/A'
  const m = v / 1_000_000
  return `$${m.toFixed(0)}M`
}

/**
 * `maxY` = last calendar year in HCRIS extract (same as `range.max`).
 * Prefer value on that year; else latest prior year with a numeric value (mirrors income fallbacks).
 * Used for `tottotrev` and `opexp` “HCRIS Last Year” columns.
 */
function pickMoneyMetricFromHcrisYearMapLast(yearMapForNorm, maxY) {
  if (!yearMapForNorm || !Number.isFinite(maxY)) {
    return { text: 'N/A', num: null, usedYear: null }
  }
  const yMax = Math.trunc(maxY)
  const atMax = yearMapForNorm.get(yMax) ?? yearMapForNorm.get(maxY)
  if (atMax && Number.isFinite(atMax.num)) {
    return { text: fmtMoneyMillions(atMax.num), num: atMax.num, usedYear: yMax }
  }
  if (atMax?.raw && atMax.raw !== 'NA') {
    const p = parseLooseNumber(atMax.raw)
    if (Number.isFinite(p)) return { text: fmtMoneyMillions(p), num: p, usedYear: yMax }
    return { text: atMax.raw, num: null, usedYear: yMax }
  }
  let bestY = null
  let bestNum = null
  for (const [yy, e] of yearMapForNorm.entries()) {
    const yi = Math.trunc(Number(yy))
    if (!Number.isFinite(yi) || yi > yMax) continue
    if (e && Number.isFinite(e.num)) {
      if (bestY == null || yi > bestY) {
        bestY = yi
        bestNum = e.num
      }
    }
  }
  if (bestY != null && Number.isFinite(bestNum)) {
    return { text: fmtMoneyMillions(bestNum), num: bestNum, usedYear: bestY }
  }
  return { text: 'N/A', num: null, usedYear: null }
}

function pickTotTotRevDisplayForHcrisLastYear(yearMapForNorm, maxY) {
  return pickMoneyMetricFromHcrisYearMapLast(yearMapForNorm, maxY)
}

/** Same fallbacks as `pickMoneyMetricFromHcrisYearMapLast`, for merged year rows `{ opexNum, opexRaw }`. */
function pickOpexpMetricFromHcrisYearMapLast(yearMapForNorm, maxY) {
  if (!yearMapForNorm || !Number.isFinite(maxY)) {
    return { text: 'N/A', num: null, usedYear: null }
  }
  const yMax = Math.trunc(maxY)
  const atMax = yearMapForNorm.get(yMax) ?? yearMapForNorm.get(maxY)
  if (atMax && Number.isFinite(atMax.opexpNum)) {
    return { text: fmtMoneyMillions(atMax.opexpNum), num: atMax.opexpNum, usedYear: yMax }
  }
  if (atMax?.opexpRaw && atMax.opexpRaw !== 'NA') {
    const p = parseLooseNumber(atMax.opexpRaw)
    if (Number.isFinite(p)) return { text: fmtMoneyMillions(p), num: p, usedYear: yMax }
    return { text: atMax.opexpRaw, num: null, usedYear: yMax }
  }
  let bestY = null
  let bestNum = null
  for (const [yy, e] of yearMapForNorm.entries()) {
    const yi = Math.trunc(Number(yy))
    if (!Number.isFinite(yi) || yi > yMax) continue
    if (e && Number.isFinite(e.opexpNum)) {
      if (bestY == null || yi > bestY) {
        bestY = yi
        bestNum = e.opexpNum
      }
    }
  }
  if (bestY != null && Number.isFinite(bestNum)) {
    return { text: fmtMoneyMillions(bestNum), num: bestNum, usedYear: bestY }
  }
  return { text: 'N/A', num: null, usedYear: null }
}

function pickOpexpDisplayForHcrisLastYear(yearMapForNorm, maxY) {
  return pickOpexpMetricFromHcrisYearMapLast(yearMapForNorm, maxY)
}

/** Same year selection as revenue/opex “HCRIS Last Year”, for merged `{ grandTotalBedsNum }` rows. */
function pickGrandTotalBedsFromHcrisYearMapLast(yearMapForNorm, maxY) {
  if (!yearMapForNorm || !Number.isFinite(maxY)) {
    return { text: 'N/A', num: null, usedYear: null }
  }
  const yMax = Math.trunc(maxY)
  const atMax = yearMapForNorm.get(yMax) ?? yearMapForNorm.get(maxY)
  if (atMax && Number.isFinite(atMax.grandTotalBedsNum)) {
    const n = atMax.grandTotalBedsNum
    return { text: Math.round(n).toLocaleString(), num: n, usedYear: yMax }
  }
  let bestY = null
  let bestNum = null
  for (const [yy, e] of yearMapForNorm.entries()) {
    const yi = Math.trunc(Number(yy))
    if (!Number.isFinite(yi) || yi > yMax) continue
    if (e && Number.isFinite(e.grandTotalBedsNum)) {
      if (bestY == null || yi > bestY) {
        bestY = yi
        bestNum = e.grandTotalBedsNum
      }
    }
  }
  if (bestY != null && Number.isFinite(bestNum)) {
    return { text: Math.round(bestNum).toLocaleString(), num: bestNum, usedYear: bestY }
  }
  return { text: 'N/A', num: null, usedYear: null }
}

function safeMean(nums) {
  let sum = 0
  let n = 0
  for (const v of nums) {
    if (!Number.isFinite(v)) continue
    sum += v
    n += 1
  }
  return n ? sum / n : null
}

function computeScatterBounds(points) {
  let min = null
  let max = null
  for (const p of points) {
    const x = p?.x
    const y = p?.y
    if (Number.isFinite(x)) {
      min = min == null ? x : Math.min(min, x)
      max = max == null ? x : Math.max(max, x)
    }
    if (Number.isFinite(y)) {
      min = min == null ? y : Math.min(min, y)
      max = max == null ? y : Math.max(max, y)
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
  if (min === max) return { min: min * 0.9, max: max * 1.1 }
  const pad = (max - min) * 0.06
  return { min: min - pad, max: max + pad }
}

function PrePostRevExpTooltip({ active, payload, byNorm }) {
  if (!active || !payload?.length) return null
  const p = payload?.[0]?.payload
  const norm = p?.norm
  const series = p?.series
  const row = norm ? byNorm?.get(norm) : null
  if (!row) return null

  const fmtM = (v) => (Number.isFinite(v) ? `$${Number(v).toFixed(0)}M` : 'N/A')
  const revPre = fmtM(row.preRevM)
  const revPost = fmtM(row.postRevM)
  const expPre = fmtM(row.preExpM)
  const expPost = fmtM(row.postExpM)

  const revDir =
    Number.isFinite(row.preRevM) && Number.isFinite(row.postRevM)
      ? row.postRevM >= row.preRevM
        ? '↑'
        : '↓'
      : ''
  const expDir =
    Number.isFinite(row.preExpM) && Number.isFinite(row.postExpM)
      ? row.postExpM >= row.preExpM
        ? '↑'
        : '↓'
      : ''

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, maxWidth: 360 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{row.name}</div>
      <div style={{ color: '#475569', marginBottom: 8 }}>
        Hovering: <span style={{ fontWeight: 600 }}>{series ?? 'Point'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 12px', fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ color: '#0f172a' }}>Revenue (pre → post)</div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>{revPre}</span> →{' '}
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>{revPost}</span> {revDir}
        </div>
        <div style={{ color: '#0f172a' }}>Expense (pre → post)</div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: '#f97316', fontWeight: 600 }}>{expPre}</span> →{' '}
          <span style={{ color: '#f97316', fontWeight: 600 }}>{expPost}</span> {expDir}
        </div>
      </div>
      <div style={{ marginTop: 8, color: '#64748b' }}>
        Points above the diagonal increased post‑merger.
      </div>
    </div>
  )
}

function parseLooseNumber(v) {
  const s = toCleanString(v)
  if (!s) return null
  const parenNeg = /^\((.+)\)$/.exec(s)
  const core = parenNeg ? parenNeg[1] : s
  const cleaned = core.replace(/[$,]/g, '').replace(/\s+/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return parenNeg ? -n : n
}

/** X-axis / bar order: pre-merger → latest HCRIS year in range */
const FINANCIAL_PERIOD_AXIS = [
  { period: 'Pre-Merger', pick: 'pre', barFill: '#475569' },
  { period: 'Merger Year', pick: 'event', barFill: '#ea580c' },
  { period: 'Post-Merger', pick: 'post1', barFill: '#2563eb' },
  { period: 'Latest Available Year', pick: 'last', barFill: '#7c3aed' },
]

const INCOME_LINES_TOP_N = 10

function ChartTakeaway({ label, children }) {
  return (
    <aside className="hc-takeaway" aria-label={label}>
      <div className="hc-takeaway__label">{label}</div>
      <p className="hc-takeaway__body">{children}</p>
    </aside>
  )
}

export default function HospitalConsolidationTab() {
  // Bump to force HCRIS re-parse after hot reload changes that affect parsing logic.
  const HCRIS_PARSE_VERSION = 1

  const [chowLoading, setChowLoading] = useState(true)
  const [chowError, setChowError] = useState(null)
  const [chowRows, setChowRows] = useState(() => [])
  const [chowNameCounts, setChowNameCounts] = useState(() => new Map()) // normalizedName -> count
  const [chowNameDisplay, setChowNameDisplay] = useState(() => new Map()) // normalizedName -> displayName
  const [chowNameEarliestTs, setChowNameEarliestTs] = useState(() => new Map()) // normalizedName -> earliest effective date (ts)
  const [matchChowNameSource, setMatchChowNameSource] = useState('') // which CHOW column we matched on

  const [hcrisLoading, setHcrisLoading] = useState(true)
  const [hcrisError, setHcrisError] = useState(null)
  const [hcrisNameDisplay, setHcrisNameDisplay] = useState(() => new Map()) // normalizedName -> displayName
  const [, setMatchHcrisNameSource] = useState('') // which HCRIS column we matched on
  const [, setMatchHcrisIncomeSource] = useState('') // which HCRIS column we used for income
  const [hcrisYearRangeByNorm, setHcrisYearRangeByNorm] = useState(() => new Map()) // normalizedName -> range + income fields + totTotRev* end-year (aligned with max calendar year)
  const [hcrisIncomeAtEventYearByNorm, setHcrisIncomeAtEventYearByNorm] = useState(() => new Map()) // normalizedName -> number
  const [hcrisIncomePreEventYearByNorm, setHcrisIncomePreEventYearByNorm] = useState(() => new Map()) // normalizedName -> number (ayear === (eventYear - 1))
  const [hcrisIncomePreEventYearRawByNorm, setHcrisIncomePreEventYearRawByNorm] = useState(() => new Map()) // normalizedName -> raw string (ayear === (eventYear - 1))
  const [hcrisIncomePostEventYearByNorm, setHcrisIncomePostEventYearByNorm] = useState(() => new Map()) // normalizedName -> number (ayear === (eventYear + 1))
  const [hcrisIncomePostEventYearRawByNorm, setHcrisIncomePostEventYearRawByNorm] = useState(() => new Map()) // normalizedName -> raw string (ayear === (eventYear + 1))
  const [hcrisGrandTotalBedsPreEventYearByNorm, setHcrisGrandTotalBedsPreEventYearByNorm] = useState(() => new Map())
  const [matchHcrisGrandTotalBedsSource, setMatchHcrisGrandTotalBedsSource] = useState('')
  const [hcrisTotTotRevPreEventYearByNorm, setHcrisTotTotRevPreEventYearByNorm] = useState(() => new Map())
  const [hcrisTotTotRevPreEventYearRawByNorm, setHcrisTotTotRevPreEventYearRawByNorm] = useState(() => new Map())
  const [matchHcrisTotTotRevSource, setMatchHcrisTotTotRevSource] = useState('')
  /** norm -> Map(year -> tottotrev, opex, beds_grandtotal; merged per year so duplicate rows do not wipe fields) */
  const [hcrisTotTotRevByNormYear, setHcrisTotTotRevByNormYear] = useState(() => new Map())
  const [hcrisOpexpPreEventYearByNorm, setHcrisOpexpPreEventYearByNorm] = useState(() => new Map())
  const [hcrisOpexpPreEventYearRawByNorm, setHcrisOpexpPreEventYearRawByNorm] = useState(() => new Map())
  const [matchHcrisOpexpSource, setMatchHcrisOpexpSource] = useState('')

  function fmtYearRange(range) {
    const min = range?.min
    const max = range?.max
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 'N/A'
    if (min === max) return String(min)
    return `${min}–${max}`
  }

  function normalizeName(name) {
    return toCleanString(name)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  useEffect(() => {
    let cancelled = false
    setChowLoading(true)
    setChowError(null)

    ;(async () => {
      try {
        const resp = await fetch(resolvePublicUrl('Hospital_CHOW_2026.01.02.csv'), { cache: 'no-store' })
        if (!resp.ok) throw new Error(`Failed to load CHOW: ${resp.status} ${resp.statusText}`)
        const csvText = await resp.text()
        const { parsed } = tryParseCsv(csvText)
        const dataRows = Array.isArray(parsed.data) ? parsed.data : []
        // CHOW name field used for name matching (auto-detect based on what's present).
        const chowNameKeyCandidates = [
          'hospital_name',
          'ORGANIZATION NAME - BUYER',
          'DOING BUSINESS AS NAME - BUYER',
          'ORGANIZATION NAME - SELLER',
          'DOING BUSINESS AS NAME - SELLER',
          'ORGANIZATION NAME',
        ]
        const nameKey =
          chowNameKeyCandidates.map((k) => findColumnKey(dataRows, k)).find(Boolean) ??
          findColumnKey(dataRows, chowNameKeyCandidates[0]) ??
          chowNameKeyCandidates[0]
        const effKey = findColumnKey(dataRows, 'EFFECTIVE DATE') ?? 'EFFECTIVE DATE'

        const counts = new Map()
        const display = new Map()
        const earliest = new Map()

        for (const r of dataRows) {
          const raw = toCleanString(r?.[nameKey])
          if (!raw) continue
          const norm = normalizeName(raw)
          if (!norm) continue
          counts.set(norm, (counts.get(norm) ?? 0) + 1)
          if (!display.has(norm)) display.set(norm, raw)

          const ts = parseEffectiveDateToTimestamp(r?.[effKey])
          if (Number.isFinite(ts)) {
            const prev = earliest.get(norm)
            if (!Number.isFinite(prev) || ts < prev) earliest.set(norm, ts)
          }
        }

        if (!cancelled) {
          setChowRows(dataRows)
          setMatchChowNameSource(nameKey)
          setChowNameCounts(counts)
          setChowNameDisplay(display)
          setChowNameEarliestTs(earliest)
          setChowLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setChowError(e instanceof Error ? e.message : String(e))
          setChowRows([])
          setMatchChowNameSource('')
          setChowLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setHcrisLoading(true)
    setHcrisError(null)

    const displayOut = new Map()
    let detectedKey = null
    let detectedYearKey = null
    let detectedIncomeKey = null
    let detectedGrandTotalBedsKey = null
    let detectedTotTotRevKey = null
    let detectedOpexpKey = null
    let detectedNetPatRevKey = null
    let detectedBedsTotalKey = null
    const rangeOut = new Map()
    const eventIncomeOut = new Map()
    const preEventIncomeOut = new Map()
    const preEventIncomeRawOut = new Map()
    const postEventIncomeOut = new Map()
    const postEventIncomeRawOut = new Map()
    const preEventGrandTotalBedsOut = new Map()
    const preEventTotTotRevOut = new Map()
    const preEventTotTotRevRawOut = new Map()
    const preEventOpexpOut = new Map()
    const preEventOpexpRawOut = new Map()
    const totTotRevByNormYear = new Map()

    // Build a fast lookup of event year per normalized name (from CHOW earliest effective date).
    const eventYearByNorm = new Map()
    for (const [norm, ts] of chowNameEarliestTs.entries()) {
      if (!Number.isFinite(ts)) continue
      const y = new Date(ts).getUTCFullYear()
      if (y >= 1900 && y <= 2100) eventYearByNorm.set(norm, y)
    }

    Papa.parse('/hcris_hospyear.csv', {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      step: (results) => {
        if (cancelled) return
        const r = results?.data
        if (!r) return
        // Identify `beds_grandtotal` (meta first — same as tottotrev/opexp — then row, then key scan).
        if (!detectedGrandTotalBedsKey && Array.isArray(results?.meta?.fields)) {
          const fromMetaBeds = resolveHcrisPhysicalKeyFromMetaFields(
            results.meta.fields,
            HCRIS_BEDS_GRANDTOTAL_ALIASES
          )
          if (fromMetaBeds) detectedGrandTotalBedsKey = fromMetaBeds
        }
        if (!detectedGrandTotalBedsKey && typeof r === 'object' && !Array.isArray(r)) {
          detectedGrandTotalBedsKey = identifyHcrisBedsGrandtotalColumnKey(r, results?.meta?.fields)
        }
        if (!detectedGrandTotalBedsKey && typeof r === 'object' && !Array.isArray(r)) {
          const want = normalizeHeaderKey(HCRIS_COLUMN_BEDS_GRANDTOTAL)
          const hit = Object.keys(r).find(
            (k) => normalizeHeaderKey(toCleanString(String(k).replace(/^\ufeff/, ''))) === want
          )
          if (hit) detectedGrandTotalBedsKey = hit
        }
        if (!detectedTotTotRevKey && Array.isArray(results?.meta?.fields)) {
          const fromMeta = resolveHcrisPhysicalKeyFromMetaFields(results.meta.fields, HCRIS_TOTTOTREV_ALIASES)
          if (fromMeta) detectedTotTotRevKey = fromMeta
        }
        if (!detectedTotTotRevKey && typeof r === 'object' && !Array.isArray(r)) {
          detectedTotTotRevKey = identifyHcrisTotTotRevColumnKey(r, results?.meta?.fields)
        }
        if (!detectedOpexpKey && Array.isArray(results?.meta?.fields)) {
          const opexpMeta = resolveHcrisPhysicalKeyFromMetaFields(results.meta.fields, HCRIS_OPEXP_ALIASES)
          if (opexpMeta) detectedOpexpKey = opexpMeta
        }
        if (!detectedOpexpKey && typeof r === 'object' && !Array.isArray(r)) {
          detectedOpexpKey = identifyHcrisOpexpColumnKey(r, results?.meta?.fields)
        }
        if (!detectedOpexpKey && typeof r === 'object' && !Array.isArray(r)) {
          const want = normalizeHeaderKey(HCRIS_COLUMN_OPEXP)
          const hit = Object.keys(r).find(
            (k) => normalizeHeaderKey(toCleanString(String(k).replace(/^\ufeff/, ''))) === want
          )
          if (hit) detectedOpexpKey = hit
        }

        if (!detectedNetPatRevKey && Array.isArray(results?.meta?.fields)) {
          const fromMeta = resolveHcrisPhysicalKeyFromMetaFields(results.meta.fields, HCRIS_NETPATREV_ALIASES)
          if (fromMeta) detectedNetPatRevKey = fromMeta
        }
        if (!detectedNetPatRevKey && typeof r === 'object' && !Array.isArray(r)) {
          detectedNetPatRevKey = identifyHcrisNetPatRevColumnKey(r, results?.meta?.fields)
        }

        if (!detectedBedsTotalKey && Array.isArray(results?.meta?.fields)) {
          const fromMeta = resolveHcrisPhysicalKeyFromMetaFields(results.meta.fields, HCRIS_BEDS_TOTAL_ALIASES)
          if (fromMeta) detectedBedsTotalKey = fromMeta
        }
        if (!detectedBedsTotalKey && typeof r === 'object' && !Array.isArray(r)) {
          detectedBedsTotalKey = identifyHcrisBedsTotalColumnKey(r, results?.meta?.fields)
        }
        // HCRIS name field used for matching (auto-detect on first row).
        if (!detectedKey) {
          const hcrisCandidates = ['hospital_name', 'ORGANIZATION NAME', 'organization_name', 'HOSPITAL_NAME']
          const keys = Object.keys(r)
          for (const want of hcrisCandidates) {
            const desired = normalizeHeaderKey(want)
            const found = keys.find((k) => normalizeHeaderKey(k) === desired)
            if (found) {
              detectedKey = found
              break
            }
          }
          if (!detectedKey) detectedKey = 'hospital_name'

          // Also detect HCRIS year field (preferred: `ayear`).
          const yearCandidates = ['ayear', 'AYEAR', 'financial_year', 'year']
          for (const want of yearCandidates) {
            const desired = normalizeHeaderKey(want)
            const found = keys.find((k) => normalizeHeaderKey(k) === desired)
            if (found) {
              detectedYearKey = found
              break
            }
          }
          if (!detectedYearKey) detectedYearKey = 'ayear'

          // Also detect HCRIS income field.
          const incomeCandidates = ['income', 'net_income', 'INCOME', 'NET_INCOME']
          for (const want of incomeCandidates) {
            const desired = normalizeHeaderKey(want)
            const found = keys.find((k) => normalizeHeaderKey(k) === desired)
            if (found) {
              detectedIncomeKey = found
              break
            }
          }
          if (!detectedIncomeKey) detectedIncomeKey = 'income'
        }

        const raw = toCleanString(r?.[detectedKey])
        if (!raw) return
        const norm = normalizeName(raw)
        if (norm && !displayOut.has(norm)) displayOut.set(norm, raw)

        if (norm) {
          const yRaw = toCleanString(r?.[detectedYearKey])
          const y = Number(yRaw)
          if (Number.isFinite(y) && y >= 1900 && y <= 2100) {
            const yKey = Math.trunc(y)
            const incomeRaw = toCleanString(r?.[detectedIncomeKey])
            const incomeVal = parseLooseNumber(incomeRaw)
            const ttrReadKey = detectedTotTotRevKey ? resolveHcrisRowFieldKey(r, detectedTotTotRevKey) : null
            const ttrRaw = ttrReadKey ? toCleanString(r?.[ttrReadKey]) : ''
            const ttrVal = ttrReadKey ? parseLooseNumber(ttrRaw) : null
            const opexReadKey = detectedOpexpKey ? resolveHcrisRowFieldKey(r, detectedOpexpKey) : null
            const opexRaw = opexReadKey ? toCleanString(r?.[opexReadKey]) : ''
            const opexVal = opexReadKey ? parseLooseNumber(opexRaw) : null
            const bedsVal = readHcrisGrandTotalBedsForRow(r, detectedGrandTotalBedsKey)
            const netPatRevVal = readHcrisNumericForRow(r, detectedNetPatRevKey)
            const bedsTotalVal = readHcrisBedsTotalForRow(r, detectedBedsTotalKey)
            const eventYear = eventYearByNorm.get(norm)
            if (Number.isFinite(eventYear) && y === eventYear && Number.isFinite(incomeVal) && !eventIncomeOut.has(norm)) {
              eventIncomeOut.set(norm, incomeVal)
            }
            // Pre-event income: exact match for (eventYear - 1); first row wins for income snapshot.
            if (Number.isFinite(eventYear) && y === eventYear - 1 && !preEventIncomeRawOut.has(norm)) {
              preEventIncomeRawOut.set(norm, incomeRaw || 'NA')
              if (Number.isFinite(incomeVal)) preEventIncomeOut.set(norm, incomeVal)
            }
            if (
              Number.isFinite(eventYear) &&
              y === eventYear - 1 &&
              ttrReadKey &&
              !preEventTotTotRevRawOut.has(norm)
            ) {
              preEventTotTotRevRawOut.set(norm, ttrRaw || 'NA')
              if (Number.isFinite(ttrVal)) preEventTotTotRevOut.set(norm, ttrVal)
            }
            if (
              Number.isFinite(eventYear) &&
              y === eventYear - 1 &&
              opexReadKey &&
              !preEventOpexpRawOut.has(norm)
            ) {
              preEventOpexpRawOut.set(norm, opexRaw || 'NA')
              if (Number.isFinite(opexVal)) preEventOpexpOut.set(norm, opexVal)
            }
            // `beds_grandtotal` at CHOW−1 year: first numeric value seen for that hospital-year.
            if (
              Number.isFinite(eventYear) &&
              y === eventYear - 1 &&
              detectedGrandTotalBedsKey &&
              !preEventGrandTotalBedsOut.has(norm)
            ) {
              const gtb = readHcrisGrandTotalBedsForRow(r, detectedGrandTotalBedsKey)
              if (Number.isFinite(gtb)) preEventGrandTotalBedsOut.set(norm, gtb)
            }
            // Post-event income: exact match for (eventYear + 1).
            if (
              Number.isFinite(eventYear) &&
              y === eventYear + 1 &&
              !postEventIncomeRawOut.has(norm)
            ) {
              postEventIncomeRawOut.set(norm, incomeRaw || 'NA')
              if (Number.isFinite(incomeVal)) postEventIncomeOut.set(norm, incomeVal)
            }
            const prev = rangeOut.get(norm)
            if (!prev) {
              const isEventYear = Number.isFinite(eventYear) && y === eventYear
              rangeOut.set(norm, {
                min: y,
                max: y,
                incomeFirstYear: incomeVal,
                incomeEndYear: incomeVal,
                incomeEndYearRaw: incomeRaw || 'NA',
                incomeEndYearNum: Number.isFinite(incomeVal) ? incomeVal : null,
                incomeFirstNonMissingYear: Number.isFinite(incomeVal) ? y : null,
                incomeFirstNonMissing: Number.isFinite(incomeVal) ? incomeVal : null,
                incomeEndNonMissingYear: Number.isFinite(incomeVal) ? y : null,
                incomeEndNonMissing: Number.isFinite(incomeVal) ? incomeVal : null,
                incomeEventYearUsed: isEventYear && Number.isFinite(incomeVal) ? y : null,
                incomeEventYear: isEventYear && Number.isFinite(incomeVal) ? incomeVal : null,
              })
            } else {
              const nextMin = Math.min(prev.min, y)
              const nextMax = Math.max(prev.max, y)

              let nextIncomeFirstYear = prev.incomeFirstYear
              let nextIncomeEndYear = prev.incomeEndYear
              let nextIncomeEndYearRaw = prev.incomeEndYearRaw
              let nextIncomeEndYearNum = prev.incomeEndYearNum

              // If we found an earlier year, replace the "first year" income (even if missing).
              if (y < prev.min) nextIncomeFirstYear = incomeVal
              // If same earliest year and income was missing, fill it.
              if (y === prev.min && !Number.isFinite(nextIncomeFirstYear) && Number.isFinite(incomeVal)) nextIncomeFirstYear = incomeVal

              // If we found a later year, replace the "end year" income (even if missing).
              if (y > prev.max) {
                nextIncomeEndYear = incomeVal
                nextIncomeEndYearRaw = incomeRaw || 'NA'
                nextIncomeEndYearNum = Number.isFinite(incomeVal) ? incomeVal : null
              }
              // If same latest year and income was missing, fill it.
              if (y === prev.max && !Number.isFinite(nextIncomeEndYear) && Number.isFinite(incomeVal)) nextIncomeEndYear = incomeVal
              if (y === prev.max && (toCleanString(nextIncomeEndYearRaw) === '' || nextIncomeEndYearRaw === 'NA') && (incomeRaw || 'NA') !== 'NA') {
                nextIncomeEndYearRaw = incomeRaw
              }
              if (y === prev.max && !Number.isFinite(nextIncomeEndYearNum) && Number.isFinite(incomeVal)) nextIncomeEndYearNum = incomeVal

              // Track earliest year with non-missing income.
              let firstNonMissingYear = prev.incomeFirstNonMissingYear
              let firstNonMissing = prev.incomeFirstNonMissing
              if (Number.isFinite(incomeVal)) {
                if (!Number.isFinite(firstNonMissingYear) || y < firstNonMissingYear) {
                  firstNonMissingYear = y
                  firstNonMissing = incomeVal
                }
              }

              // Track latest year with non-missing income.
              let endNonMissingYear = prev.incomeEndNonMissingYear
              let endNonMissing = prev.incomeEndNonMissing
              if (Number.isFinite(incomeVal)) {
                if (!Number.isFinite(endNonMissingYear) || y > endNonMissingYear) {
                  endNonMissingYear = y
                  endNonMissing = incomeVal
                }
              }

              // Track income at the CHOW event year (earliest effective date year) if available.
              let incomeEventYearUsed = prev.incomeEventYearUsed
              let incomeEventYear = prev.incomeEventYear
              const eventYear = eventYearByNorm.get(norm)
              if (Number.isFinite(eventYear) && y === eventYear && Number.isFinite(incomeVal)) {
                incomeEventYearUsed = y
                incomeEventYear = incomeVal
              }

              rangeOut.set(norm, {
                min: nextMin,
                max: nextMax,
                incomeFirstYear: nextIncomeFirstYear,
                incomeEndYear: nextIncomeEndYear,
                incomeEndYearRaw: nextIncomeEndYearRaw,
                incomeEndYearNum: nextIncomeEndYearNum,
                incomeFirstNonMissingYear: firstNonMissingYear,
                incomeFirstNonMissing: firstNonMissing,
                incomeEndNonMissingYear: endNonMissingYear,
                incomeEndNonMissing: endNonMissing,
                incomeEventYearUsed,
                incomeEventYear,
              })
            }
            // One map per norm/year: duplicate HCRIS rows for the same hospital-year must not let
            // the last row clear tottotrev, opex, or beds when another field was filled on an earlier row.
            if (
              norm &&
              (ttrReadKey || opexReadKey || detectedGrandTotalBedsKey || detectedNetPatRevKey || detectedBedsTotalKey)
            ) {
              let ym = totTotRevByNormYear.get(norm)
              if (!ym) {
                ym = new Map()
                totTotRevByNormYear.set(norm, ym)
              }
              const prev = ym.get(yKey) ?? {}
              const next = { ...prev }
              if (ttrReadKey) {
                if (Number.isFinite(ttrVal)) {
                  next.num = ttrVal
                  next.raw = ttrRaw || 'NA'
                } else if (Number.isFinite(prev.num)) {
                  next.num = prev.num
                  next.raw = prev.raw ?? 'NA'
                } else {
                  next.num = null
                  next.raw = ttrRaw && toCleanString(ttrRaw) ? ttrRaw : prev.raw ?? 'NA'
                }
              } else {
                next.num = prev.num ?? null
                next.raw = prev.raw ?? 'NA'
              }
              if (opexReadKey) {
                if (Number.isFinite(opexVal)) {
                  next.opexpNum = opexVal
                  next.opexpRaw = opexRaw || 'NA'
                } else if (Number.isFinite(prev.opexpNum)) {
                  next.opexpNum = prev.opexpNum
                  next.opexpRaw = prev.opexpRaw ?? 'NA'
                } else {
                  next.opexpNum = null
                  next.opexpRaw = opexRaw && toCleanString(opexRaw) ? opexRaw : prev.opexpRaw ?? 'NA'
                }
              } else {
                next.opexpNum = prev.opexpNum ?? null
                next.opexpRaw = prev.opexpRaw ?? 'NA'
              }
              if (detectedGrandTotalBedsKey) {
                if (Number.isFinite(bedsVal)) {
                  next.grandTotalBedsNum = bedsVal
                } else if (Number.isFinite(prev.grandTotalBedsNum)) {
                  next.grandTotalBedsNum = prev.grandTotalBedsNum
                } else {
                  next.grandTotalBedsNum = null
                }
              } else {
                next.grandTotalBedsNum = prev.grandTotalBedsNum ?? null
              }

              if (detectedNetPatRevKey) {
                if (Number.isFinite(netPatRevVal)) {
                  next.netpatrevNum = netPatRevVal
                } else if (Number.isFinite(prev.netpatrevNum)) {
                  next.netpatrevNum = prev.netpatrevNum
                } else {
                  next.netpatrevNum = null
                }
              } else {
                next.netpatrevNum = prev.netpatrevNum ?? null
              }

              if (detectedBedsTotalKey) {
                if (Number.isFinite(bedsTotalVal)) {
                  next.bedsTotalNum = bedsTotalVal
                } else if (Number.isFinite(prev.bedsTotalNum)) {
                  next.bedsTotalNum = prev.bedsTotalNum
                } else {
                  next.bedsTotalNum = null
                }
              } else {
                next.bedsTotalNum = prev.bedsTotalNum ?? null
              }
              ym.set(yKey, next)
            }
          }
        }
      },
      complete: () => {
        if (cancelled) return
        setHcrisNameDisplay(displayOut)
        setMatchHcrisNameSource(detectedKey ?? '')
        setMatchHcrisIncomeSource(detectedIncomeKey ?? '')
        setMatchHcrisGrandTotalBedsSource(detectedGrandTotalBedsKey ?? '')
        setMatchHcrisTotTotRevSource(detectedTotTotRevKey ?? '')
        setMatchHcrisOpexpSource(detectedOpexpKey ?? '')
        setHcrisYearRangeByNorm(rangeOut)
        setHcrisIncomeAtEventYearByNorm(eventIncomeOut)
        setHcrisIncomePreEventYearByNorm(preEventIncomeOut)
        setHcrisIncomePreEventYearRawByNorm(preEventIncomeRawOut)
        setHcrisIncomePostEventYearByNorm(postEventIncomeOut)
        setHcrisIncomePostEventYearRawByNorm(postEventIncomeRawOut)
        setHcrisGrandTotalBedsPreEventYearByNorm(preEventGrandTotalBedsOut)
        setHcrisTotTotRevPreEventYearByNorm(preEventTotTotRevOut)
        setHcrisTotTotRevPreEventYearRawByNorm(preEventTotTotRevRawOut)
        setHcrisOpexpPreEventYearByNorm(preEventOpexpOut)
        setHcrisOpexpPreEventYearRawByNorm(preEventOpexpRawOut)
        setHcrisTotTotRevByNormYear(totTotRevByNormYear)
        setHcrisLoading(false)
      },
      error: (err) => {
        if (cancelled) return
        setHcrisError(err instanceof Error ? err.message : String(err))
        setHcrisNameDisplay(new Map())
        setMatchHcrisNameSource('')
        setMatchHcrisIncomeSource('')
        setMatchHcrisGrandTotalBedsSource('')
        setMatchHcrisTotTotRevSource('')
        setMatchHcrisOpexpSource('')
        setHcrisYearRangeByNorm(new Map())
        setHcrisIncomeAtEventYearByNorm(new Map())
        setHcrisIncomePreEventYearByNorm(new Map())
        setHcrisIncomePreEventYearRawByNorm(new Map())
        setHcrisIncomePostEventYearByNorm(new Map())
        setHcrisIncomePostEventYearRawByNorm(new Map())
        setHcrisGrandTotalBedsPreEventYearByNorm(new Map())
        setHcrisTotTotRevPreEventYearByNorm(new Map())
        setHcrisTotTotRevPreEventYearRawByNorm(new Map())
        setHcrisOpexpPreEventYearByNorm(new Map())
        setHcrisOpexpPreEventYearRawByNorm(new Map())
        setHcrisTotTotRevByNormYear(new Map())
        setHcrisLoading(false)
      },
    })

    return () => {
      cancelled = true
    }
  }, [chowNameEarliestTs, HCRIS_PARSE_VERSION])

  const chowEventsByYear = useMemo(() => {
    if (!Array.isArray(chowRows) || chowRows.length === 0) return []
    const effKey = findColumnKey(chowRows, 'EFFECTIVE DATE') ?? 'EFFECTIVE DATE'
    const counts = new Map()
    for (const r of chowRows) {
      const y = getYearFromEffectiveDate(r?.[effKey])
      if (!y) continue
      increment(counts, y, 1)
    }
    return mapToSortedArray(counts, { keyName: 'year', valueName: 'count', desc: false, numericKeys: true })
  }, [chowRows])

  const chowTopBuyerStates = useMemo(() => {
    if (!Array.isArray(chowRows) || chowRows.length === 0) return []
    const key = findColumnKey(chowRows, 'ENROLLMENT STATE - BUYER') ?? 'ENROLLMENT STATE - BUYER'
    const counts = new Map()
    for (const r of chowRows) {
      const raw = toCleanString(r?.[key])
      const state = raw ? raw.toUpperCase() : 'Unknown'
      increment(counts, state, 1)
    }
    return mapToSortedArray(counts, { keyName: 'state', valueName: 'count', desc: true })
      .filter((d) => d.state !== 'Unknown')
      .slice(0, 10)
  }, [chowRows])

  const chowTopBuyerOrgs = useMemo(() => {
    if (!Array.isArray(chowRows) || chowRows.length === 0) return []
    const key = findColumnKey(chowRows, 'ORGANIZATION NAME - BUYER') ?? 'ORGANIZATION NAME - BUYER'
    const counts = new Map()
    for (const r of chowRows) {
      const raw = toCleanString(r?.[key])
      const org = raw || 'Unknown'
      increment(counts, org, 1)
    }
    return mapToSortedArray(counts, { keyName: 'org', valueName: 'count', desc: true })
      .filter((d) => d.org !== 'Unknown')
      .slice(0, 10)
  }, [chowRows])

  const chowTopBuyerOrgsMax = useMemo(() => {
    if (!chowTopBuyerOrgs.length) return 0
    return Math.max(0, ...chowTopBuyerOrgs.map((d) => Number(d?.count) || 0))
  }, [chowTopBuyerOrgs])

  const matchedHospitals = useMemo(() => {
    if (!chowNameCounts.size || !hcrisNameDisplay.size) return []

    const excludedNormNames = new Set([normalizeName('Vanderbilt University Medical Center')])

    // Build a best-guess "health system" label per CHOW hospital name
    // by taking the most frequent buyer organization among rows with that hospital name.
    const buyerOrgKey =
      findColumnKey(chowRows, 'ORGANIZATION NAME - BUYER') ??
      findColumnKey(chowRows, 'DOING BUSINESS AS NAME - BUYER') ??
      'ORGANIZATION NAME - BUYER'
    const buyerDbaKey = findColumnKey(chowRows, 'DOING BUSINESS AS NAME - BUYER') ?? 'DOING BUSINESS AS NAME - BUYER'
    const hospitalKey = matchChowNameSource || findColumnKey(chowRows, 'hospital_name') || 'hospital_name'

    const systemCountsByNorm = new Map() // norm -> Map(systemName -> count)
    for (const r of chowRows) {
      const hospRaw = toCleanString(r?.[hospitalKey])
      if (!hospRaw) continue
      const norm = normalizeName(hospRaw)
      if (!norm) continue
      if (excludedNormNames.has(norm)) continue

      const sysRaw =
        toCleanString(r?.[buyerOrgKey]) ||
        toCleanString(r?.[buyerDbaKey]) ||
        ''
      if (!sysRaw) continue

      let inner = systemCountsByNorm.get(norm)
      if (!inner) {
        inner = new Map()
        systemCountsByNorm.set(norm, inner)
      }
      inner.set(sysRaw, (inner.get(sysRaw) ?? 0) + 1)
    }

    const systemByNorm = new Map()
    for (const [norm, m] of systemCountsByNorm.entries()) {
      let best = null
      let bestCount = -1
      for (const [sys, c] of m.entries()) {
        if (c > bestCount) {
          best = sys
          bestCount = c
        }
      }
      if (best) systemByNorm.set(norm, best)
    }

    const arr = []
    for (const [norm, count] of chowNameCounts.entries()) {
      const hcrisName = hcrisNameDisplay.get(norm)
      if (!hcrisName) continue
      if (excludedNormNames.has(norm)) continue

      const range = hcrisYearRangeByNorm.get(norm)
      const minY = range?.min
      const maxY = range?.max
      const earliestTs = chowNameEarliestTs.get(norm)
      const eventYear = Number.isFinite(earliestTs) ? new Date(earliestTs).getUTCFullYear() : null
      if (!Number.isFinite(minY) || !Number.isFinite(maxY) || !Number.isFinite(eventYear)) continue
      if (eventYear < minY || eventYear > maxY) continue
      const preYear = eventYear - 1
      if (preYear < minY || preYear > maxY) continue

      const totLastPick = pickTotTotRevDisplayForHcrisLastYear(hcrisTotTotRevByNormYear.get(norm), maxY)
      const opexLastPick = pickOpexpDisplayForHcrisLastYear(hcrisTotTotRevByNormYear.get(norm), maxY)
      const bedsLastPick = pickGrandTotalBedsFromHcrisYearMapLast(hcrisTotTotRevByNormYear.get(norm), maxY)

      arr.push({
        norm,
        chowName: chowNameDisplay.get(norm) ?? norm,
        healthSystem: systemByNorm.get(norm) ?? 'N/A',
        hcrisName,
        chowCount: count,
        chowEventYear: eventYear,
        chowEventYearMinus1: Number.isFinite(eventYear) ? eventYear - 1 : null,
        chowEventYearPlus1: Number.isFinite(eventYear) ? eventYear + 1 : null,
        effectiveDate: formatDateYmd(earliestTs),
        hcrisYearRange: fmtYearRange(range),
        hcrisEndYear: maxY,
        hcrisIncomeLastYearInRange: (() => {
          const n = range?.incomeEndYearNum
          if (Number.isFinite(n)) return fmtMoneyMillions(n)
          const raw = range?.incomeEndYearRaw
          if (raw && raw !== 'NA') return raw
          const n2 = range?.incomeEndNonMissing
          return Number.isFinite(n2) ? fmtMoneyMillions(n2) : 'NA'
        })(),
        hcrisIncomeLastYearInRangeUsedYear: (() => {
          const n = range?.incomeEndYearNum
          if (Number.isFinite(n)) return maxY
          const raw = range?.incomeEndYearRaw
          if (raw && raw !== 'NA') return maxY
          const y = range?.incomeEndNonMissingYear
          return Number.isFinite(y) ? y : null
        })(),
        hcrisIncomeLastYearInRangeNum: (() => {
          const n = range?.incomeEndYearNum
          if (Number.isFinite(n)) return n
          const raw = range?.incomeEndYearRaw
          const parsed = parseLooseNumber(raw)
          if (Number.isFinite(parsed)) return parsed
          const n2 = range?.incomeEndNonMissing
          return Number.isFinite(n2) ? n2 : null
        })(),
        hcrisTotTotRevLastYearInRange: totLastPick.text,
        hcrisTotTotRevLastYearInRangeUsedYear: totLastPick.usedYear,
        hcrisTotTotRevLastYearInRangeNum: totLastPick.num,
        hcrisOpexpLastYearInRange: opexLastPick.text,
        hcrisOpexpLastYearInRangeUsedYear: opexLastPick.usedYear,
        hcrisOpexpLastYearInRangeNum: opexLastPick.num,
        hcrisGrandTotalBedsLastYearInRange: bedsLastPick.text,
        hcrisGrandTotalBedsLastYearInRangeUsedYear: bedsLastPick.usedYear,
        hcrisGrandTotalBedsLastYearInRangeNum: bedsLastPick.num,
        incomeFirstYear: fmtMoneyMillions(range?.incomeFirstNonMissing),
        incomeEndYear: fmtMoneyMillions(range?.incomeEndNonMissing),
        incomeFirstYearUsed: range?.incomeFirstNonMissingYear ?? null,
        incomeEndYearUsed: range?.incomeEndNonMissingYear ?? null,
        incomePreEventYearNum: hcrisIncomePreEventYearByNorm.get(norm),
        incomePreEventYear: (() => {
          const n = hcrisIncomePreEventYearByNorm.get(norm)
          if (Number.isFinite(n)) return fmtMoneyMillions(n)
          const raw = hcrisIncomePreEventYearRawByNorm.get(norm)
          return raw ? raw : 'N/A'
        })(),
        totTotRevPreChowMinus1YearNum: hcrisTotTotRevPreEventYearByNorm.get(norm),
        totTotRevPreChowMinus1Year: (() => {
          const n = hcrisTotTotRevPreEventYearByNorm.get(norm)
          if (Number.isFinite(n)) return fmtMoneyMillions(n)
          const raw = hcrisTotTotRevPreEventYearRawByNorm.get(norm)
          return raw && raw !== 'NA' ? raw : 'N/A'
        })(),
        opexpPreChowMinus1YearNum: hcrisOpexpPreEventYearByNorm.get(norm),
        opexpPreChowMinus1Year: (() => {
          const n = hcrisOpexpPreEventYearByNorm.get(norm)
          if (Number.isFinite(n)) return fmtMoneyMillions(n)
          const raw = hcrisOpexpPreEventYearRawByNorm.get(norm)
          return raw && raw !== 'NA' ? raw : 'N/A'
        })(),
        grandTotalBedsPreChowMinus1YearNum: hcrisGrandTotalBedsPreEventYearByNorm.get(norm),
        grandTotalBedsPreChowMinus1Year: (() => {
          const b = hcrisGrandTotalBedsPreEventYearByNorm.get(norm)
          if (Number.isFinite(b)) return Math.round(b).toLocaleString()
          return 'N/A'
        })(),
        incomePostEventYearNum: hcrisIncomePostEventYearByNorm.get(norm),
        incomePostEventYear: (() => {
          const n = hcrisIncomePostEventYearByNorm.get(norm)
          if (Number.isFinite(n)) return fmtMoneyMillions(n)
          const raw = hcrisIncomePostEventYearRawByNorm.get(norm)
          return raw ? raw : 'N/A'
        })(),
        incomeEventYearNum: hcrisIncomeAtEventYearByNorm.get(norm),
        incomeEventYear: fmtMoneyMillions(hcrisIncomeAtEventYearByNorm.get(norm)),
        incomeDeltaEventMinusPre: (() => {
          const ev = hcrisIncomeAtEventYearByNorm.get(norm)
          const pre = hcrisIncomePreEventYearByNorm.get(norm)
          if (!Number.isFinite(ev) || !Number.isFinite(pre)) return 'N/A'
          return fmtMoneyMillions(ev - pre)
        })(),
        incomeDeltaLastMinusPre: (() => {
          const last = (() => {
            const n = range?.incomeEndYearNum
            if (Number.isFinite(n)) return n
            const raw = range?.incomeEndYearRaw
            const parsed = parseLooseNumber(raw)
            if (Number.isFinite(parsed)) return parsed
            const n2 = range?.incomeEndNonMissing
            return Number.isFinite(n2) ? n2 : null
          })()
          const pre = hcrisIncomePreEventYearByNorm.get(norm)
          if (!Number.isFinite(last) || !Number.isFinite(pre)) return 'N/A'
          return fmtMoneyMillions(last - pre)
        })(),
        incomeDeltaLastMinusPreNum: (() => {
          const last = (() => {
            const n = range?.incomeEndYearNum
            if (Number.isFinite(n)) return n
            const raw = range?.incomeEndYearRaw
            const parsed = parseLooseNumber(raw)
            if (Number.isFinite(parsed)) return parsed
            const n2 = range?.incomeEndNonMissing
            return Number.isFinite(n2) ? n2 : null
          })()
          const pre = hcrisIncomePreEventYearByNorm.get(norm)
          if (!Number.isFinite(last) || !Number.isFinite(pre)) return null
          return last - pre
        })(),
        incomeDeltaLastMinusPost1: (() => {
          const last = (() => {
            const n = range?.incomeEndYearNum
            if (Number.isFinite(n)) return n
            const raw = range?.incomeEndYearRaw
            const parsed = parseLooseNumber(raw)
            if (Number.isFinite(parsed)) return parsed
            const n2 = range?.incomeEndNonMissing
            return Number.isFinite(n2) ? n2 : null
          })()
          const post1 = hcrisIncomePostEventYearByNorm.get(norm)
          if (!Number.isFinite(last) || !Number.isFinite(post1)) return 'N/A'
          return fmtMoneyMillions(last - post1)
        })(),
      })
    }
    arr.sort((a, b) => b.chowCount - a.chowCount || a.chowName.localeCompare(b.chowName))
    return arr
  }, [
    chowNameCounts,
    hcrisNameDisplay,
    chowNameDisplay,
    chowNameEarliestTs,
    hcrisYearRangeByNorm,
    hcrisIncomeAtEventYearByNorm,
    hcrisIncomePreEventYearByNorm,
    hcrisIncomePreEventYearRawByNorm,
    hcrisTotTotRevPreEventYearByNorm,
    hcrisTotTotRevPreEventYearRawByNorm,
    hcrisTotTotRevByNormYear,
    hcrisIncomePostEventYearByNorm,
    hcrisIncomePostEventYearRawByNorm,
    hcrisGrandTotalBedsPreEventYearByNorm,
    chowRows,
    matchChowNameSource,
  ])

  const revenueExpenseBeforeAfterBars = useMemo(() => {
    if (!matchedHospitals.length) return []

    const preRev = []
    const preExp = []
    const postRev = []
    const postExp = []

    for (const h of matchedHospitals) {
      // Pre = CHOW−1 year snapshots already computed.
      preRev.push(h?.totTotRevPreChowMinus1YearNum)
      preExp.push(h?.opexpPreChowMinus1YearNum)

      // Post = CHOW+1 year from merged per-year map (same hospital-year basis as income post snapshot).
      const norm = h?.norm
      const y = h?.chowEventYearPlus1
      if (!norm || !Number.isFinite(y)) continue
      const ym = hcrisTotTotRevByNormYear.get(norm)
      const rec = ym?.get(Math.trunc(y))
      postRev.push(rec?.num)
      postExp.push(rec?.opexpNum)
    }

    const preRevMean = safeMean(preRev)
    const preExpMean = safeMean(preExp)
    const postRevMean = safeMean(postRev)
    const postExpMean = safeMean(postExp)

    if (!Number.isFinite(preRevMean) && !Number.isFinite(preExpMean) && !Number.isFinite(postRevMean) && !Number.isFinite(postExpMean)) {
      return []
    }

    return [
      {
        phase: 'Pre-Merger',
        revenueM: Number.isFinite(preRevMean) ? preRevMean / 1_000_000 : null,
        expenseM: Number.isFinite(preExpMean) ? preExpMean / 1_000_000 : null,
      },
      {
        phase: 'Post-Merger',
        revenueM: Number.isFinite(postRevMean) ? postRevMean / 1_000_000 : null,
        expenseM: Number.isFinite(postExpMean) ? postExpMean / 1_000_000 : null,
      },
    ]
  }, [matchedHospitals, hcrisTotTotRevByNormYear])

  const revenuePerBedBeforeAfterBars = useMemo(() => {
    if (!matchedHospitals.length) return []
    const preVals = []
    const postVals = []

    for (const h of matchedHospitals) {
      const norm = h?.norm
      if (!norm) continue
      const ym = hcrisTotTotRevByNormYear.get(norm)
      if (!ym) continue

      const preY = h?.chowEventYearMinus1
      const postY = h?.chowEventYearPlus1
      const preRec = Number.isFinite(preY) ? ym.get(Math.trunc(preY)) : null
      const postRec = Number.isFinite(postY) ? ym.get(Math.trunc(postY)) : null

      const preRev = preRec?.netpatrevNum
      const preBeds = preRec?.bedsTotalNum
      const postRev = postRec?.netpatrevNum
      const postBeds = postRec?.bedsTotalNum

      const pre = Number.isFinite(preRev) && Number.isFinite(preBeds) && preBeds > 0 ? preRev / preBeds : null
      const post = Number.isFinite(postRev) && Number.isFinite(postBeds) && postBeds > 0 ? postRev / postBeds : null

      if (Number.isFinite(pre)) preVals.push(pre)
      if (Number.isFinite(post)) postVals.push(post)
    }

    const preMean = safeMean(preVals)
    const postMean = safeMean(postVals)
    if (!Number.isFinite(preMean) && !Number.isFinite(postMean)) return []

    // Display in $K per bed for readability.
    return [
      { phase: 'Pre-Merger', revPerBedK: Number.isFinite(preMean) ? preMean / 1_000 : null },
      { phase: 'Post-Merger', revPerBedK: Number.isFinite(postMean) ? postMean / 1_000 : null },
    ]
  }, [matchedHospitals, hcrisTotTotRevByNormYear])

  const revenuePrePostScatter = useMemo(() => {
    if (!matchedHospitals.length) return { points: [], bounds: { min: 0, max: 1 } }
    const pts = []
    for (const h of matchedHospitals) {
      const pre = h?.totTotRevPreChowMinus1YearNum
      const norm = h?.norm
      const y = h?.chowEventYearPlus1
      if (!norm || !Number.isFinite(y)) continue
      const ym = hcrisTotTotRevByNormYear.get(norm)
      const rec = ym?.get(Math.trunc(y))
      const post = rec?.num
      if (!Number.isFinite(pre) || !Number.isFinite(post)) continue
      pts.push({
        name: h?.chowName ?? norm,
        series: 'Revenue',
        norm,
        x: pre / 1_000_000,
        y: post / 1_000_000,
      })
    }
    return { points: pts, bounds: computeScatterBounds(pts) }
  }, [matchedHospitals, hcrisTotTotRevByNormYear])

  const expensePrePostScatter = useMemo(() => {
    if (!matchedHospitals.length) return { points: [], bounds: { min: 0, max: 1 } }
    const pts = []
    for (const h of matchedHospitals) {
      const pre = h?.opexpPreChowMinus1YearNum
      const norm = h?.norm
      const y = h?.chowEventYearPlus1
      if (!norm || !Number.isFinite(y)) continue
      const ym = hcrisTotTotRevByNormYear.get(norm)
      const rec = ym?.get(Math.trunc(y))
      const post = rec?.opexpNum
      if (!Number.isFinite(pre) || !Number.isFinite(post)) continue
      pts.push({
        name: h?.chowName ?? norm,
        series: 'Expense',
        norm,
        x: pre / 1_000_000,
        y: post / 1_000_000,
      })
    }
    return { points: pts, bounds: computeScatterBounds(pts) }
  }, [matchedHospitals, hcrisTotTotRevByNormYear])

  const revExpPrePostByNorm = useMemo(() => {
    const m = new Map()
    for (const h of matchedHospitals) {
      const norm = h?.norm
      if (!norm) continue
      const y = h?.chowEventYearPlus1
      const ym = Number.isFinite(y) ? hcrisTotTotRevByNormYear.get(norm) : null
      const rec = Number.isFinite(y) ? ym?.get(Math.trunc(y)) : null
      const preRevM = Number.isFinite(h?.totTotRevPreChowMinus1YearNum) ? h.totTotRevPreChowMinus1YearNum / 1_000_000 : null
      const postRevM = Number.isFinite(rec?.num) ? rec.num / 1_000_000 : null
      const preExpM = Number.isFinite(h?.opexpPreChowMinus1YearNum) ? h.opexpPreChowMinus1YearNum / 1_000_000 : null
      const postExpM = Number.isFinite(rec?.opexpNum) ? rec.opexpNum / 1_000_000 : null
      m.set(norm, { name: h?.chowName ?? norm, preRevM, postRevM, preExpM, postExpM })
    }
    return m
  }, [matchedHospitals, hcrisTotTotRevByNormYear])

  const revExpPrePostScatterCombined = useMemo(() => {
    const points = [...(revenuePrePostScatter.points ?? []), ...(expensePrePostScatter.points ?? [])]
    return {
      points,
      bounds: computeScatterBounds(points),
      hasRevenue: (revenuePrePostScatter.points?.length ?? 0) > 0,
      hasExpense: (expensePrePostScatter.points?.length ?? 0) > 0,
    }
  }, [revenuePrePostScatter.points, expensePrePostScatter.points])

  const incomeLinesTop = useMemo(() => {
    const ranked = matchedHospitals
      .filter((h) => Number.isFinite(h.incomeDeltaLastMinusPreNum))
      .map((h) => ({ h, abs: Math.abs(h.incomeDeltaLastMinusPreNum) }))
      .sort((a, b) => b.abs - a.abs)
      .slice(0, INCOME_LINES_TOP_N)
      .map((x) => x.h)
    if (ranked.length) return ranked
    return matchedHospitals.slice(0, INCOME_LINES_TOP_N)
  }, [matchedHospitals])

  const incomeLinesSpec = useMemo(() => {
    return incomeLinesTop.map((h, idx) => ({
      key: `h${idx + 1}`,
      name: h.chowName,
      pre: h.incomePreEventYearNum,
      event: h.incomeEventYearNum,
      post1: h.incomePostEventYearNum,
      last: h.hcrisIncomeLastYearInRangeNum,
    }))
  }, [incomeLinesTop])

  const incomeLinesChartData = useMemo(() => {
    return FINANCIAL_PERIOD_AXIS.map(({ period, pick }) => {
      const row = { period }
      for (const s of incomeLinesSpec) {
        const v = s[pick]
        row[s.key] = Number.isFinite(v) ? v / 1_000_000 : null
      }
      return row
    })
  }, [incomeLinesSpec])

  const incomeLinesColor = (i) =>
    [
      '#2563eb',
      '#16a34a',
      '#f97316',
      '#a855f7',
      '#0ea5e9',
      '#ef4444',
      '#84cc16',
      '#14b8a6',
      '#f59e0b',
      '#6366f1',
      '#22c55e',
      '#e11d48',
      '#0f766e',
      '#be185d',
      '#7c3aed',
      '#047857',
      '#b45309',
      '#1d4ed8',
    ][i % 18]

  const avgIncomeBars = useMemo(() => {
    const nums = {
      pre: [],
      event: [],
      post1: [],
      last: [],
    }

    for (const h of matchedHospitals) {
      if (Number.isFinite(h.incomePreEventYearNum)) nums.pre.push(h.incomePreEventYearNum)
      if (Number.isFinite(h.incomeEventYearNum)) nums.event.push(h.incomeEventYearNum)
      if (Number.isFinite(h.incomePostEventYearNum)) nums.post1.push(h.incomePostEventYearNum)
      if (Number.isFinite(h.hcrisIncomeLastYearInRangeNum)) nums.last.push(h.hcrisIncomeLastYearInRangeNum)
    }

    const mean = (arr) => {
      if (!arr.length) return null
      return arr.reduce((a, b) => a + b, 0) / arr.length
    }

    const rows = FINANCIAL_PERIOD_AXIS.map(({ period, pick, barFill }) => ({
      period,
      barFill,
      avg: mean(nums[pick]),
      n: nums[pick].length,
    }))

    return rows.map((r) => ({
      period: r.period,
      barFill: r.barFill,
      avgIncomeM: Number.isFinite(r.avg) ? r.avg / 1_000_000 : null,
      n: r.n,
    }))
  }, [matchedHospitals])

  const avgDeltaLastMinusChowMinus1 = useMemo(() => {
    const vals = matchedHospitals
      .map((h) => h.incomeDeltaLastMinusPreNum)
      .filter((v) => Number.isFinite(v))
    if (!vals.length) return { value: null, n: 0 }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    return { value: avg, n: vals.length }
  }, [matchedHospitals])

  const medianDeltaLastMinusChowMinus1 = useMemo(() => {
    const vals = matchedHospitals
      .map((h) => h.incomeDeltaLastMinusPreNum)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)
    const n = vals.length
    if (!n) return { value: null, n: 0 }
    const mid = Math.floor(n / 2)
    const med = n % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
    return { value: med, n }
  }, [matchedHospitals])

  const chowStateMarketSummary = useMemo(() => {
    if (!Array.isArray(chowRows) || chowRows.length === 0) return null
    const key = findColumnKey(chowRows, 'ENROLLMENT STATE - BUYER') ?? 'ENROLLMENT STATE - BUYER'
    const counts = new Map()
    let total = 0
    for (const r of chowRows) {
      const raw = toCleanString(r?.[key])
      if (!raw) continue
      const st = raw.toUpperCase()
      if (st === 'UNKNOWN') continue
      increment(counts, st, 1)
      total++
    }
    if (!total) return null
    const sorted = mapToSortedArray(counts, { keyName: 'state', valueName: 'count', desc: true })
    const top3 = sorted.slice(0, 3)
    const top3Count = top3.reduce((s, d) => s + d.count, 0)
    return {
      total,
      top3,
      top3Pct: (100 * top3Count) / total,
      leader: top3[0] ?? null,
    }
  }, [chowRows])

  const chowOrgMarketSummary = useMemo(() => {
    if (!Array.isArray(chowRows) || chowRows.length === 0) return null
    const key = findColumnKey(chowRows, 'ORGANIZATION NAME - BUYER') ?? 'ORGANIZATION NAME - BUYER'
    const counts = new Map()
    let total = 0
    for (const r of chowRows) {
      const raw = toCleanString(r?.[key])
      if (!raw) continue
      increment(counts, raw, 1)
      total++
    }
    if (!total) return null
    const sorted = mapToSortedArray(counts, { keyName: 'org', valueName: 'count', desc: true }).filter(
      (d) => toCleanString(d.org) && d.org !== 'Unknown'
    )
    const top = sorted[0]
    const top3 = sorted.slice(0, 3)
    const top3Count = top3.reduce((s, d) => s + d.count, 0)
    return {
      total,
      top,
      top3,
      top3Pct: (100 * top3Count) / total,
      top1Pct: top ? (100 * top.count) / total : null,
    }
  }, [chowRows])

  const pctIncomeImproved = useMemo(() => {
    const withNum = matchedHospitals.filter((h) => Number.isFinite(h.incomeDeltaLastMinusPreNum))
    if (!withNum.length) return null
    const improved = withNum.filter((h) => h.incomeDeltaLastMinusPreNum > 0).length
    return { pct: (100 * improved) / withNum.length, improved, n: withNum.length }
  }, [matchedHospitals])

  const yearlyChowTakeaway = useMemo(() => {
    if (chowEventsByYear.length < 2) return null
    const y0 = chowEventsByYear[0]
    const y1 = chowEventsByYear[chowEventsByYear.length - 1]
    const c0 = Number(y0.count)
    const c1 = Number(y1.count)
    if (c1 > c0) {
      return `From ${y0.year} to ${y1.year}, annual CHOW volume rises (${c0.toLocaleString()} → ${c1.toLocaleString()}), consistent with accelerating consolidation in this extract.`
    }
    if (c1 < c0) {
      return `From ${y0.year} to ${y1.year}, annual CHOW counts fall (${c0.toLocaleString()} → ${c1.toLocaleString()}); consider policy windows and reporting artifacts when interpreting the downtick.`
    }
    return `The series starts and ends near the same annual pace (${c0.toLocaleString()} events in both ${y0.year} and ${y1.year}), so the net trend is flat across this slice.`
  }, [chowEventsByYear])

  const stateHeatTakeaway = useMemo(() => {
    if (!chowStateMarketSummary?.leader) return null
    const { leader, top3Pct, total } = chowStateMarketSummary
    return `${leader.state} records ${Number(leader.count).toLocaleString()} of ${Number(total).toLocaleString()} geocoded transfers; the top three states together explain about ${top3Pct.toFixed(0)}% of events, showing clear geographic concentration.`
  }, [chowStateMarketSummary])

  const orgConcentrationTakeaway = useMemo(() => {
    if (!chowOrgMarketSummary?.top) return null
    const { top, top1Pct, top3Pct, total } = chowOrgMarketSummary
    return `${truncateMiddle(top.org, 48)} accounts for roughly ${top1Pct?.toFixed(0)}% of buyer-tagged CHOW rows (${Number(top.count).toLocaleString()} of ${Number(total).toLocaleString()}); the top three buyers collectively reach about ${top3Pct.toFixed(0)}%, so a narrow acquirer set drives most volume.`
  }, [chowOrgMarketSummary])

  const keyFinancialFinding = useMemo(() => {
    if (!Number.isFinite(avgDeltaLastMinusChowMinus1.value) || !pctIncomeImproved) return null
    const dir = avgDeltaLastMinusChowMinus1.value >= 0 ? 'rose' : 'fell'
    const avgTxt = fmtMoneyMillions(Math.abs(avgDeltaLastMinusChowMinus1.value))
    return `Average matched-hospital income ${dir} by ${avgTxt} from pre-merger to the latest HCRIS year. About ${pctIncomeImproved.pct.toFixed(0)}% of those hospitals land higher financially at the end of the window, though gains vary by buyer.`
  }, [avgDeltaLastMinusChowMinus1, pctIncomeImproved])

  const consolidationExecutiveTakeaway = useMemo(() => {
    const t = chowOrgMarketSummary?.top1Pct
    if (!Number.isFinite(t)) return null
    return `Consolidation is highly concentrated: the busiest buyer alone touches roughly ${t.toFixed(0)}% of CHOW rows in this extract, underscoring how few systems shape national deal flow.`
  }, [chowOrgMarketSummary])

  const avgBarVsPre = useMemo(() => {
    if (avgIncomeBars.length < 2) return null
    const pre = avgIncomeBars.find((d) => d.period === 'Pre-Merger')
    const last = avgIncomeBars.find((d) => d.period === 'Latest Available Year')
    if (!pre || !last || !Number.isFinite(pre.avgIncomeM) || !Number.isFinite(last.avgIncomeM)) return null
    const delta = last.avgIncomeM - pre.avgIncomeM
    if (Math.abs(delta) < 0.05) {
      return `Average income is nearly unchanged from pre-merger (${pre.avgIncomeM.toFixed(1)} $M) to the latest year (${last.avgIncomeM.toFixed(1)} $M), so the population-level lift is muted in this match.`
    }
    const dir = delta > 0 ? 'higher' : 'lower'
    return `Average reported income ends ${dir} after consolidation (${pre.avgIncomeM.toFixed(1)} → ${last.avgIncomeM.toFixed(1)} $M), which supports the view that, on average, financial capacity improves heading into the latest HCRIS year.`
  }, [avgIncomeBars])

  // Temporarily hide before/after chart sections.
  const showBeforeAfterCharts = false

  return (
    <div
      className="hc-dashboard"
      style={{ minHeight: `calc(100vh - ${TAB_BAR_APPROX_PX}px)` }}
    >
      <header className="hc-hero">
        <div className="hc-hero__inner">
          <h1 className="hc-hero__title">Financial Impact of Hospital Consolidation</h1>
          <p className="hc-hero__subtitle">
            This dashboard examines how hospital ownership changes (CHOW events) affect financial performance before
            and after mergers, using matched CHOW and HCRIS hospital data.
          </p>
        </div>
      </header>
      <div className="hc-dashboard__inner">
        <div className="hc-sectionIntro" role="region" aria-label="Section 1">
          <div className="hc-sectionIntro__kicker">Section 1 · Healthcare consolidation landscape</div>
          <h2 className="hc-sectionIntro__title">Who is consolidating?</h2>
          <p className="hc-sectionIntro__lede">
            Ownership volume, geography, and repeat buyers, before interpreting dollars and cents in Section 2.
          </p>
        </div>
        <div className="hc-dashboard__grid">
          <section className="hc-panel hc-panel--delay-1">
            <div className="hc-card hc-chartCard">
              <div className="hc-chartHeader">
                <h2 className="hc-chartTitle">Consolidation Footprint: Who, Where, and How Fast</h2>
                <p className="hc-chartSubtitle">
                  Establishes the deal flow baseline before quantifying the financial before-and-after impact of
                  ownership change.
                </p>
              </div>

              <div className="hc-dashboard__row--three">
                <div className="hc-card hc-chartCard" style={{ padding: 12 }}>
                  <div className="hc-chartHeader" style={{ padding: '2px 4px 12px' }}>
                    <h3 className="hc-chartTitle">Deal Volume Trend: Ownership Transfers Over Time</h3>
                    <p className="hc-chartSubtitle">
                      A time-series view of consolidation activity that frames the timing of financial “before vs after”
                      comparisons.
                    </p>
                  </div>

                  {chowLoading ? (
                    <div className="hc-chartFrame" role="status" aria-label="Loading chart">
                      <div className="hc-chartEmpty">Loading CHOW dataset…</div>
                    </div>
                  ) : chowError ? (
                    <div className="hc-chartFrame" role="alert" aria-label="Chart error">
                      <div className="hc-chartEmpty hc-chartEmpty--error">Unable to render chart: {chowError}</div>
                    </div>
                  ) : chowEventsByYear.length === 0 ? (
                    <div className="hc-chartFrame" aria-label="No data">
                      <div className="hc-chartEmpty">No valid years found in EFFECTIVE DATE.</div>
                    </div>
                  ) : (
                    <div className="hc-chartFrame" style={{ height: 520 }} aria-label="CHOW events by year chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chowEventsByYear} margin={{ top: 12, right: 18, bottom: 46, left: 14 }}>
                          <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="year"
                            tickMargin={8}
                            tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 12 }}
                            axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          >
                            <Label value="Year" position="bottom" offset={18} style={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 13 }} />
                          </XAxis>
                          <YAxis
                            allowDecimals={false}
                            tickMargin={2}
                            tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 12 }}
                            axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          >
                            <Label
                              value="CHOW Event Count"
                              angle={-90}
                              position="left"
                              offset={4}
                              style={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 13 }}
                            />
                          </YAxis>
                          <Tooltip
                            cursor={{ fill: 'rgba(148, 163, 184, 0.22)' }}
                            formatter={(value) => [Number(value).toLocaleString(), 'CHOW events']}
                            labelFormatter={(label) => `Year: ${label}`}
                            contentStyle={{
                              borderRadius: 10,
                              border: '1px solid rgba(15, 23, 42, 0.12)',
                              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                            }}
                            labelStyle={{ color: '#0f172a', fontWeight: 650 }}
                          />
                          <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {!chowLoading && !chowError && yearlyChowTakeaway ? (
                    <ChartTakeaway label="Takeaway">{yearlyChowTakeaway}</ChartTakeaway>
                  ) : null}
                </div>

                <div className="hc-card hc-chartCard" style={{ padding: 12 }}>
                  <div className="hc-chartHeader" style={{ padding: '2px 4px 12px' }}>
                    <h3 className="hc-chartTitle">Geographic Concentration: Consolidation Hotspots</h3>
                    <p className="hc-chartSubtitle">
                      Highlights where ownership change is most active, providing market context for financial shifts
                      observed after consolidation.
                    </p>
                  </div>

                {chowLoading ? (
                  <div className="hc-chartFrame" role="status" aria-label="Loading chart">
                    <div className="hc-chartEmpty">Loading CHOW dataset…</div>
                  </div>
                ) : chowError ? (
                  <div className="hc-chartFrame" role="alert" aria-label="Chart error">
                    <div className="hc-chartEmpty hc-chartEmpty--error">Unable to render chart: {chowError}</div>
                  </div>
                ) : chowTopBuyerStates.length === 0 ? (
                  <div className="hc-chartFrame" aria-label="No data">
                    <div className="hc-chartEmpty">No buyer state values found.</div>
                  </div>
                ) : (
                  <div className="hc-chartFrame" style={{ height: 520 }} aria-label="Top buyer states chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...chowTopBuyerStates].reverse()}
                        layout="vertical"
                        margin={{ top: 14, right: 18, bottom: 48, left: 0 }}
                        barCategoryGap={10}
                      >
                        <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          interval={0}
                          tickMargin={8}
                          tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                        >
                          <Label
                            value="CHOW Event Count"
                            position="bottom"
                            offset={18}
                            style={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 13 }}
                          />
                        </XAxis>
                        <YAxis
                          type="category"
                          dataKey="state"
                          width={56}
                          interval={0}
                          tickMargin={6}
                          tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(148, 163, 184, 0.22)' }}
                          formatter={(value) => [Number(value).toLocaleString(), 'CHOW events']}
                          labelFormatter={(label) => `State: ${label}`}
                          contentStyle={{
                            borderRadius: 10,
                            border: '1px solid rgba(15, 23, 42, 0.12)',
                            boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                          }}
                          labelStyle={{ color: '#0f172a', fontWeight: 650 }}
                        />
                        <Bar dataKey="count" fill="#2563eb" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                  {!chowLoading && !chowError && stateHeatTakeaway ? (
                    <ChartTakeaway label="Takeaway">{stateHeatTakeaway}</ChartTakeaway>
                  ) : null}
                </div>

                <div className="hc-card hc-chartCard" style={{ padding: 6 }}>
                  <div className="hc-chartHeader" style={{ padding: '2px 4px 12px' }}>
                    <h3 className="hc-chartTitle">Buyer Concentration: Systems Driving Acquisition Activity</h3>
                    <p className="hc-chartSubtitle">
                      Identifies repeat acquirers that may shape post-consolidation financial performance across
                      portfolios.
                    </p>
                  </div>

                {chowLoading ? (
                  <div className="hc-chartFrame" role="status" aria-label="Loading chart">
                    <div className="hc-chartEmpty">Loading CHOW dataset…</div>
                  </div>
                ) : chowError ? (
                  <div className="hc-chartFrame" role="alert" aria-label="Chart error">
                    <div className="hc-chartEmpty hc-chartEmpty--error">Unable to render chart: {chowError}</div>
                  </div>
                ) : chowTopBuyerOrgs.length === 0 ? (
                  <div className="hc-chartFrame" aria-label="No data">
                    <div className="hc-chartEmpty">No buyer organization values found.</div>
                  </div>
                ) : (
                  <div className="hc-chartFrame" style={{ height: 520 }} aria-label="Top buyer organizations chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...chowTopBuyerOrgs].reverse()}
                        layout="vertical"
                        margin={{ top: 14, right: 8, bottom: 48, left: 0 }}
                        barCategoryGap={10}
                      >
                        <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          interval={0}
                          tickMargin={8}
                          tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          domain={[0, (dataMax) => Math.ceil(dataMax * 1.12)]}
                          ticks={Array.from({ length: chowTopBuyerOrgsMax + 1 }, (_, i) => i)}
                        >
                          <Label
                            value="Number of Acquisitions (CHOW Count)"
                            position="bottom"
                            offset={18}
                            style={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 13 }}
                          />
                        </XAxis>
                        <YAxis
                          type="category"
                          dataKey="org"
                          width={Math.min(
                            170,
                            Math.max(
                              90,
                              estimateTickColumnWidthPx(
                                chowTopBuyerOrgs.map((d) => truncateMiddle(d.org, 18)),
                                { fontSize: 11, padding: 12 }
                              )
                            )
                          )}
                          interval={0}
                          tickMargin={6}
                          tick={({ x, y, payload }) => {
                            const full = String(payload?.value ?? '')
                            const short = truncateMiddle(full, 18)
                            return (
                              <g transform={`translate(${x},${y})`}>
                                <title>{full}</title>
                                <text
                                  x={-4}
                                  y={0}
                                  dy={4}
                                  textAnchor="end"
                                  fill="rgba(15, 23, 42, 0.78)"
                                  fontSize={11}
                                >
                                  {short}
                                </text>
                              </g>
                            )
                          }}
                          axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(148, 163, 184, 0.22)' }}
                          formatter={(value) => [Number(value).toLocaleString(), 'CHOW acquisitions']}
                          labelFormatter={(label) => `Buyer: ${label}`}
                          contentStyle={{
                            borderRadius: 10,
                            border: '1px solid rgba(15, 23, 42, 0.12)',
                            boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                          }}
                          labelStyle={{ color: '#0f172a', fontWeight: 650 }}
                        />
                        <Bar dataKey="count" fill="#22c55e" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                  {!chowLoading && !chowError && orgConcentrationTakeaway ? (
                    <ChartTakeaway label="Takeaway">{orgConcentrationTakeaway}</ChartTakeaway>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {showBeforeAfterCharts && (
            <>
              <div className="hc-sectionIntro hc-sectionIntro--spaced" role="region" aria-label="Section 2">
                <div className="hc-sectionIntro__kicker">Section 2 · Financial impact after consolidation</div>
                <h2 className="hc-sectionIntro__title">What happens after consolidation?</h2>
                <p className="hc-sectionIntro__lede">
                  Compare matched hospitals’ income pre-merger, in the merger year, immediately after, and through the
                  latest HCRIS reporting year in range.
                </p>
              </div>

              <section className="hc-panel hc-panel--delay-3">
            <div className="hc-card hc-chartCard">
              <div className="hc-chartHeader">
                <h2 className="hc-chartTitle">Earnings Impact: Income Before and After Consolidation</h2>
                <p className="hc-chartSubtitle">
                  Tracks income from one year pre-deal through the post-deal period and the latest available HCRIS year
                  to quantify sustained financial impact.
                </p>
              </div>

              {keyFinancialFinding || consolidationExecutiveTakeaway ? (
                <div className="hc-takeawayRow">
                  {keyFinancialFinding ? (
                    <div className="hc-takeaway hc-takeaway--key">
                      <div className="hc-takeaway__label">Key finding</div>
                      <p className="hc-takeaway__body">{keyFinancialFinding}</p>
                    </div>
                  ) : null}
                  {consolidationExecutiveTakeaway ? (
                    <div className="hc-takeaway hc-takeaway--accent">
                      <div className="hc-takeaway__label">Another finding</div>
                      <p className="hc-takeaway__body">{consolidationExecutiveTakeaway}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="hc-kpiRow">
                <div className="hc-kpiCard">
                  <div className="hc-kpiLabel">Average change (latest − pre-merger)</div>
                  <div className="hc-kpiValue">
                    {Number.isFinite(avgDeltaLastMinusChowMinus1.value)
                      ? fmtMoneyMillions(avgDeltaLastMinusChowMinus1.value)
                      : 'N/A'}
                  </div>
                </div>
                <div className="hc-kpiCard">
                  <div className="hc-kpiLabel">Median change (latest − pre-merger)</div>
                  <div className="hc-kpiValue">
                    {Number.isFinite(medianDeltaLastMinusChowMinus1.value)
                      ? fmtMoneyMillions(medianDeltaLastMinusChowMinus1.value)
                      : 'N/A'}
                  </div>
                </div>
              </div>

              {chowLoading || hcrisLoading ? (
                <div className="hc-chartFrame" role="status" aria-label="Loading chart">
                  <div className="hc-chartEmpty">Loading datasets and matching names…</div>
                </div>
              ) : chowError || hcrisError ? (
                <div className="hc-chartFrame" role="alert" aria-label="Chart error">
                  <div className="hc-chartEmpty hc-chartEmpty--error">
                    Unable to compute income series: {chowError || hcrisError}
                  </div>
                </div>
              ) : matchedHospitals.length === 0 ? (
                <div className="hc-chartFrame" aria-label="No matches">
                  <div className="hc-chartEmpty">
                    No overlapping hospital names found. This usually means the CHOW/HCRIS name columns differ or the naming conventions differ.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
                  <div className="hc-card hc-chartCard" style={{ padding: 16 }}>
                    <div className="hc-chartHeader" style={{ padding: '2px 4px 12px' }}>
                      <h3 className="hc-chartTitle">Income Trajectories: Before → After by Hospital</h3>
                      <p className="hc-chartSubtitle">
                        Shows heterogeneity in post-consolidation outcomes. For readability, this view highlights the{' '}
                        {INCOME_LINES_TOP_N} hospitals with the largest absolute change from pre-consolidation to the
                        latest available year.
                      </p>
                    </div>
                    <div
                      className="hc-chartFrame"
                      style={{ height: 520, background: 'transparent', border: 'none' }}
                      aria-label="Income trajectory line chart"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={incomeLinesChartData} margin={{ top: 10, right: 18, bottom: 56, left: 18 }}>
                          <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="period"
                            tickMargin={8}
                            interval={0}
                            height={52}
                            tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 11 }}
                            axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            angle={-16}
                            textAnchor="end"
                          />
                          <YAxis
                            tickMargin={10}
                            tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 12 }}
                            axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          >
                            <Label
                              value="Income ($M)"
                              angle={-90}
                              position="left"
                              offset={10}
                              style={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 13 }}
                            />
                          </YAxis>
                          <Tooltip
                            formatter={(v, dataKey) => {
                              const found = incomeLinesSpec.find((s) => s.key === dataKey)
                              const label = found?.name ?? String(dataKey)
                              if (v === null || v === undefined) return ['N/A', label]
                              return [`${Number(v).toFixed(1)} $M`, label]
                            }}
                            labelFormatter={(l) => `Period: ${l}`}
                            contentStyle={{
                              borderRadius: 10,
                              border: '1px solid rgba(15, 23, 42, 0.12)',
                              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                            }}
                            labelStyle={{ color: '#0f172a', fontWeight: 650 }}
                          />
                          {incomeLinesSpec.map((s, i) => (
                            <Line
                              key={s.key}
                              type="monotone"
                              dataKey={s.key}
                              name={s.name}
                              stroke={incomeLinesColor(i)}
                              strokeWidth={2.25}
                              dot={false}
                              connectNulls={false}
                              isAnimationActive={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {pctIncomeImproved ? (
                      <ChartTakeaway label="Takeaway">
                        {`Roughly ${pctIncomeImproved.pct.toFixed(0)}% of matched hospitals with a full window report higher income at the latest HCRIS year than in the pre-merger year. That is helpful context even though the chart highlights only the ${INCOME_LINES_TOP_N} largest absolute moves.`}
                      </ChartTakeaway>
                    ) : null}
                  </div>

                  <div className="hc-card hc-chartCard" style={{ padding: 16 }}>
                    <div className="hc-chartHeader" style={{ padding: '2px 4px 12px' }}>
                      <h3 className="hc-chartTitle">Portfolio Signal: Average Income Before vs After</h3>
                      <p className="hc-chartSubtitle">
                        A headline measure of financial uplift that summarizes the average post-consolidation shift in
                        income across matched hospitals.
                      </p>
                    </div>
                    <div className="hc-barLegend" aria-hidden="true">
                      {FINANCIAL_PERIOD_AXIS.map((p) => (
                        <span key={p.period} className="hc-barLegend__item">
                          <span className="hc-barLegend__swatch" style={{ background: p.barFill }} />
                          {p.period}
                        </span>
                      ))}
                    </div>
                    <div
                      className="hc-chartFrame"
                      style={{ height: 480, background: 'transparent', border: 'none' }}
                      aria-label="Average income bars"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={avgIncomeBars} margin={{ top: 10, right: 18, bottom: 48, left: 18 }} barCategoryGap={18}>
                          <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="period"
                            tickMargin={10}
                            interval={0}
                            height={48}
                            tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 11 }}
                            axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            angle={-14}
                            textAnchor="end"
                          />
                          <YAxis
                            tickMargin={10}
                            tick={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 12 }}
                            axisLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                            tickLine={{ stroke: 'rgba(15, 23, 42, 0.18)' }}
                          >
                            <Label
                              value="Average Income ($M)"
                              angle={-90}
                              position="left"
                              offset={10}
                              style={{ fill: 'rgba(15, 23, 42, 0.78)', fontSize: 13 }}
                            />
                          </YAxis>
                          <Tooltip
                            formatter={(v) => {
                              if (v === null || v === undefined) return ['N/A', 'Average income ($M)']
                              return [`${Number(v).toFixed(1)}`, 'Average income ($M)']
                            }}
                            labelFormatter={(l) => `Period: ${l}`}
                            contentStyle={{
                              borderRadius: 10,
                              border: '1px solid rgba(15, 23, 42, 0.12)',
                              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)',
                            }}
                            labelStyle={{ color: '#0f172a', fontWeight: 650 }}
                          />
                          <Bar dataKey="avgIncomeM" radius={[6, 6, 0, 0]}>
                            {avgIncomeBars.map((d, i) => (
                              <Cell key={`cell-${d.period}-${i}`} fill={d.barFill ?? '#7c3aed'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {avgBarVsPre ? <ChartTakeaway label="Takeaway">{avgBarVsPre}</ChartTakeaway> : null}
                  </div>
                </div>
              )}
            </div>
              </section>
            </>
          )}

          {showBeforeAfterCharts &&
            (revenuePerBedBeforeAfterBars.length > 0 ||
            revenueExpenseBeforeAfterBars.length > 0 ||
            revExpPrePostScatterCombined.hasRevenue ||
            revExpPrePostScatterCombined.hasExpense) && (
            <section className="hc-panel hc-panel--delay-3">
              <div
                className="hc-chartGrid"
                style={{
                  display: 'flex',
                  gap: 18,
                  alignItems: 'stretch',
                  flexWrap: 'wrap',
                }}
              >
                {revenueExpenseBeforeAfterBars.length > 0 && (
                  <div className="hc-card hc-chartCard" style={{ flex: '1 1 520px', minWidth: 360 }}>
                    <div className="hc-chartHeader">
                      <h2 className="hc-chartTitle">Financial Performance Before and After Consolidation</h2>
                      <p className="hc-chartSubtitle">
                        A portfolio-level view of revenue generation and cost scale, comparing the year before the deal
                        (CHOW−1) to the first full year after (CHOW+1).
                      </p>
                    </div>
                    <div className="hc-chartStage">
                      <ResponsiveContainer width="100%" height={520}>
                        <BarChart
                          data={revenueExpenseBeforeAfterBars}
                          margin={{ top: 10, right: 18, bottom: 10, left: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="phase" />
                          <YAxis
                            tickFormatter={(v) => (Number.isFinite(v) ? `$${Number(v).toFixed(0)}M` : '')}
                            width={70}
                          />
                          <Tooltip
                            formatter={(value, name) => {
                              if (!Number.isFinite(value)) return ['N/A', name]
                              return [`$${Number(value).toFixed(0)}M`, name]
                            }}
                          />
                          <Legend />
                          <Bar dataKey="revenueM" name="Revenue" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="expenseM" name="Expense" fill="#f97316" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <ChartTakeaway label="Takeaway">
                      Following consolidation, hospitals generated substantially more revenue while expenses increased
                      more modestly, indicating stronger financial scale and potentially improved operating leverage
                      after ownership change.
                    </ChartTakeaway>
                  </div>
                )}

                {(revExpPrePostScatterCombined.hasRevenue || revExpPrePostScatterCombined.hasExpense) && (
                  <div className="hc-card hc-chartCard" style={{ flex: '1 1 520px', minWidth: 360 }}>
                    <div className="hc-chartHeader">
                      <h2 className="hc-chartTitle">Hospital-by-Hospital Shift: Pre vs Post Consolidation</h2>
                      <p className="hc-chartSubtitle">
                        Each point compares pre-deal to post-deal performance. Points above the diagonal indicate
                        increases after consolidation, making outliers and consistent improvers easy to identify.
                      </p>
                    </div>
                    <div className="hc-chartStage">
                      <ResponsiveContainer width="100%" height={520}>
                        <ScatterChart margin={{ top: 10, right: 18, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            domain={[revExpPrePostScatterCombined.bounds.min, revExpPrePostScatterCombined.bounds.max]}
                            tickFormatter={(v) => (Number.isFinite(v) ? `$${Number(v).toFixed(0)}M` : '')}
                            name="Pre-merger ($M)"
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            domain={[revExpPrePostScatterCombined.bounds.min, revExpPrePostScatterCombined.bounds.max]}
                            tickFormatter={(v) => (Number.isFinite(v) ? `$${Number(v).toFixed(0)}M` : '')}
                            name="Post-merger ($M)"
                            width={70}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={<PrePostRevExpTooltip byNorm={revExpPrePostByNorm} />}
                          />
                          <ReferenceLine
                            segment={[
                              { x: revExpPrePostScatterCombined.bounds.min, y: revExpPrePostScatterCombined.bounds.min },
                              { x: revExpPrePostScatterCombined.bounds.max, y: revExpPrePostScatterCombined.bounds.max },
                            ]}
                            stroke="#64748b"
                            strokeDasharray="6 6"
                          />
                          <Legend />
                          {revExpPrePostScatterCombined.hasRevenue ? (
                            <Scatter name="Revenue" data={revenuePrePostScatter.points} fill="#0ea5e9" />
                          ) : null}
                          {revExpPrePostScatterCombined.hasExpense ? (
                            <Scatter name="Expense" data={expensePrePostScatter.points} fill="#f97316" />
                          ) : null}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <ChartTakeaway label="Takeaway">
                      Most hospitals fall above the diagonal line, meaning post-merger revenue and expenses are generally
                      higher than pre-merger levels. However, revenue increases tend to be larger and more frequent than
                      expense increases, suggesting consolidation is associated with stronger financial scale rather than
                      simply higher operating costs.
                    </ChartTakeaway>
                  </div>
                )}
              </div>
            </section>
          )}

          {showBeforeAfterCharts && revenuePerBedBeforeAfterBars.length > 0 && (
            <section className="hc-panel hc-panel--delay-3">
              <div className="hc-card hc-chartCard">
                <div className="hc-chartHeader">
                  <h2 className="hc-chartTitle">Operating Efficiency: Revenue per Bed Before vs After</h2>
                  <p className="hc-chartSubtitle">
                    Normalizes revenue to capacity to distinguish scale effects from efficiency gains, comparing CHOW−1
                    to CHOW+1.
                  </p>
                </div>
                <div className="hc-chartStage">
                  <ResponsiveContainer width="100%" height={420}>
                    <BarChart data={revenuePerBedBeforeAfterBars} margin={{ top: 10, right: 18, bottom: 10, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="phase" />
                      <YAxis
                        tickFormatter={(v) => (Number.isFinite(v) ? `$${Number(v).toFixed(0)}K` : '')}
                        width={70}
                      />
                      <Tooltip
                        formatter={(value) => {
                          if (!Number.isFinite(value)) return ['N/A', 'Revenue per bed']
                          return [`$${Number(value).toFixed(0)}K`, 'Revenue per bed']
                        }}
                      />
                      <Bar dataKey="revPerBedK" name="Revenue per bed" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ChartTakeaway label="Why it matters">
                  This normalizes revenue by hospital size, helping show whether revenue gains reflect larger facilities
                  or improved performance relative to capacity.
                </ChartTakeaway>
              </div>
            </section>
          )}

          {matchedHospitals.length > 0 && (
            <section className="hc-panel hc-panel--delay-3">
              <div className="hc-card hc-chartCard">
                <div className="hc-chartHeader">
                  <h2 className="hc-chartTitle">Matched Hospital Cohort (Audit Table)</h2>
                  <p className="hc-chartSubtitle">
                    The underlying matched cohort used for every before-and-after consolidation metric shown above.
                    Use this table to validate timing, coverage windows, and key financial fields.
                  </p>
                </div>
                <div className="hc-tableWrap" role="region" aria-label="Matched hospitals table">
                  <table className="hc-table">
                    <thead>
                      <tr>
                        <th>CHOW Name</th>
                        <th>CHOW Date (Earliest)</th>
                        <th style={{ textAlign: 'right' }}>CHOW Year</th>
                        <th style={{ textAlign: 'right' }}>CHOW−1 Year</th>
                        <th
                          style={{ textAlign: 'right' }}
                          title={`CHOW−1 Year: HCRIS column “${HCRIS_COLUMN_BEDS_GRANDTOTAL}” (reporting year = CHOW year − 1; same hospital-year row as pre-merger income snapshot).`}
                        >
                          {HCRIS_COLUMN_BEDS_GRANDTOTAL} (CHOW−1 Year)
                        </th>
                        <th style={{ textAlign: 'right' }}>CHOW+1 Year</th>
                        <th>HCRIS Years</th>
                        <th style={{ textAlign: 'right' }}>HCRIS Last Year</th>
                        <th style={{ textAlign: 'right' }}>Income @ HCRIS Last Year</th>
                        <th
                          style={{ textAlign: 'right' }}
                          title={`HCRIS “${HCRIS_COLUMN_TOTTOTREV}” for the last calendar year in this hospital’s HCRIS year range (same year selection as Income @ HCRIS Last Year).`}
                        >
                          {`${HCRIS_COLUMN_TOTTOTREV}(HCRIS Last Year)`}
                        </th>
                        <th
                          style={{ textAlign: 'right' }}
                          title={`Operating expense: HCRIS “${HCRIS_COLUMN_OPEXP}” for the last calendar year in this hospital’s HCRIS year range (same year selection as Income @ HCRIS Last Year).`}
                        >
                          {`${HCRIS_COLUMN_OPEXP}(HCRIS Last Year)`}
                        </th>
                        <th
                          style={{ textAlign: 'right' }}
                          title={`HCRIS “${HCRIS_COLUMN_BEDS_GRANDTOTAL}” for the last calendar year in this hospital’s HCRIS year range (same year selection as Income @ HCRIS Last Year).`}
                        >
                          {`${HCRIS_COLUMN_BEDS_GRANDTOTAL}(HCRIS Last Year)`}
                        </th>
                        <th style={{ textAlign: 'right' }}>Income @ CHOW−1</th>
                        <th
                          style={{ textAlign: 'right' }}
                          title={`HCRIS “${HCRIS_COLUMN_TOTTOTREV}” for chow-1 year (reporting year = CHOW year − 1; same hospital-year row as pre-merger income snapshot).`}
                        >
                          {`${HCRIS_COLUMN_TOTTOTREV}(chow-1 year)`}
                        </th>
                        <th
                          style={{ textAlign: 'right' }}
                          title={`Operating expense: HCRIS “${HCRIS_COLUMN_OPEXP}” for chow-1 year (reporting year = CHOW year − 1; same hospital-year row as pre-merger income snapshot).`}
                        >
                          {`${HCRIS_COLUMN_OPEXP}(chow-1 year)`}
                        </th>
                        <th style={{ textAlign: 'right' }}>Income @ CHOW+1</th>
                        <th style={{ textAlign: 'right' }}>Δ (Last − CHOW+1)</th>
                        <th style={{ textAlign: 'right' }}>Δ (Last − CHOW−1)</th>
                        <th style={{ textAlign: 'right' }}>Income @ First HCRIS Year (data)</th>
                        <th style={{ textAlign: 'right' }}>Income @ Last HCRIS Year (data)</th>
                        <th style={{ textAlign: 'right' }}>Income @ CHOW Year</th>
                        <th style={{ textAlign: 'right' }}>Δ (CHOW − CHOW−1)</th>
                        <th style={{ textAlign: 'right' }}>CHOW count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedHospitals.map((h) => (
                        <tr key={`${h.chowName}__${h.chowCount}__${h.effectiveDate}`}>
                          <td title={h.chowName}>{h.chowName}</td>
                          <td className="hc-mono">{h.effectiveDate}</td>
                          <td className="hc-num">{Number.isFinite(h.chowEventYear) ? h.chowEventYear : 'N/A'}</td>
                          <td className="hc-num">{Number.isFinite(h.chowEventYearMinus1) ? h.chowEventYearMinus1 : 'N/A'}</td>
                          <td
                            className="hc-num"
                            title={
                              Number.isFinite(h.grandTotalBedsPreChowMinus1YearNum) &&
                              Number.isFinite(h.chowEventYearMinus1)
                                ? `CHOW−1 Year (${h.chowEventYearMinus1}): HCRIS ${HCRIS_COLUMN_BEDS_GRANDTOTAL} from file field “${matchHcrisGrandTotalBedsSource}” (same hospital-year row as pre-merger income snapshot).`
                                : `CHOW−1 Year: no numeric ${HCRIS_COLUMN_BEDS_GRANDTOTAL} on the HCRIS row for reporting year ${h.chowEventYearMinus1 ?? 'CHOW−1'}, or that column was not identified in the file.`
                            }
                          >
                            {h.grandTotalBedsPreChowMinus1Year}
                          </td>
                          <td className="hc-num">{Number.isFinite(h.chowEventYearPlus1) ? h.chowEventYearPlus1 : 'N/A'}</td>
                          <td className="hc-mono">{h.hcrisYearRange}</td>
                          <td className="hc-num">{Number.isFinite(h.hcrisEndYear) ? h.hcrisEndYear : 'N/A'}</td>
                          <td
                            className="hc-num"
                            title={
                              h.hcrisIncomeLastYearInRange !== 'N/A'
                                ? `Income for last HCRIS year in range (${h.hcrisEndYear})${h.hcrisIncomeLastYearInRangeUsedYear && h.hcrisIncomeLastYearInRangeUsedYear !== h.hcrisEndYear ? ` (used ${h.hcrisIncomeLastYearInRangeUsedYear} with data)` : ''}: ${h.hcrisIncomeLastYearInRange}`
                                : `No HCRIS income found for last HCRIS year in range (${h.hcrisEndYear}).`
                            }
                          >
                            {h.hcrisIncomeLastYearInRange}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.hcrisTotTotRevLastYearInRange !== 'N/A' && h.hcrisTotTotRevLastYearInRange !== 'NA'
                                ? `${HCRIS_COLUMN_TOTTOTREV} for last HCRIS year in range (${h.hcrisEndYear})${h.hcrisTotTotRevLastYearInRangeUsedYear && h.hcrisTotTotRevLastYearInRangeUsedYear !== h.hcrisEndYear ? ` (used ${h.hcrisTotTotRevLastYearInRangeUsedYear} with data)` : ''}: ${h.hcrisTotTotRevLastYearInRange}`
                                : `No HCRIS ${HCRIS_COLUMN_TOTTOTREV} found for last HCRIS year in range (${h.hcrisEndYear}).`
                            }
                          >
                            {h.hcrisTotTotRevLastYearInRange}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.hcrisOpexpLastYearInRange !== 'N/A' && h.hcrisOpexpLastYearInRange !== 'NA'
                                ? `${HCRIS_COLUMN_OPEXP} (operating expense) for last HCRIS year in range (${h.hcrisEndYear})${h.hcrisOpexpLastYearInRangeUsedYear && h.hcrisOpexpLastYearInRangeUsedYear !== h.hcrisEndYear ? ` (used ${h.hcrisOpexpLastYearInRangeUsedYear} with data)` : ''}: ${h.hcrisOpexpLastYearInRange}`
                                : `No HCRIS ${HCRIS_COLUMN_OPEXP} found for last HCRIS year in range (${h.hcrisEndYear}).`
                            }
                          >
                            {h.hcrisOpexpLastYearInRange}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.hcrisGrandTotalBedsLastYearInRange !== 'N/A'
                                ? `${HCRIS_COLUMN_BEDS_GRANDTOTAL} for last HCRIS year in range (${h.hcrisEndYear})${h.hcrisGrandTotalBedsLastYearInRangeUsedYear && h.hcrisGrandTotalBedsLastYearInRangeUsedYear !== h.hcrisEndYear ? ` (used ${h.hcrisGrandTotalBedsLastYearInRangeUsedYear} with data)` : ''}: ${h.hcrisGrandTotalBedsLastYearInRange} (file field “${matchHcrisGrandTotalBedsSource}”).`
                                : `No HCRIS ${HCRIS_COLUMN_BEDS_GRANDTOTAL} found for last HCRIS year in range (${h.hcrisEndYear}).`
                            }
                          >
                            {h.hcrisGrandTotalBedsLastYearInRange}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.incomePreEventYear !== 'N/A'
                                ? `Income for CHOW year − 1 (${h.chowEventYearMinus1}): ${h.incomePreEventYear}`
                                : `No HCRIS income found for CHOW year − 1 (${h.chowEventYearMinus1}).`
                            }
                          >
                            {h.incomePreEventYear}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              Number.isFinite(h.totTotRevPreChowMinus1YearNum) &&
                              Number.isFinite(h.chowEventYearMinus1)
                                ? `CHOW−1 Year (${h.chowEventYearMinus1}): HCRIS ${HCRIS_COLUMN_TOTTOTREV} from file field “${matchHcrisTotTotRevSource}” (same hospital-year row as pre-merger income snapshot).`
                                : `CHOW−1 Year: no numeric ${HCRIS_COLUMN_TOTTOTREV} on the HCRIS row for reporting year ${h.chowEventYearMinus1 ?? 'CHOW−1'}, or that column was not identified in the file.`
                            }
                          >
                            {h.totTotRevPreChowMinus1Year}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              Number.isFinite(h.opexpPreChowMinus1YearNum) && Number.isFinite(h.chowEventYearMinus1)
                                ? `CHOW−1 Year (${h.chowEventYearMinus1}): HCRIS ${HCRIS_COLUMN_OPEXP} (operating expense) from file field “${matchHcrisOpexpSource}” (same hospital-year row as pre-merger income snapshot).`
                                : `CHOW−1 Year: no numeric ${HCRIS_COLUMN_OPEXP} on the HCRIS row for reporting year ${h.chowEventYearMinus1 ?? 'CHOW−1'}, or that column was not identified in the file.`
                            }
                          >
                            {h.opexpPreChowMinus1Year}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.incomePostEventYear !== 'N/A'
                                ? `Income for CHOW year + 1 (${h.chowEventYearPlus1}): ${h.incomePostEventYear}`
                                : `No HCRIS income found for CHOW year + 1 (${h.chowEventYearPlus1}).`
                            }
                          >
                            {h.incomePostEventYear}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.incomeDeltaLastMinusPost1 !== 'N/A'
                                ? `(${h.hcrisIncomeLastYearInRangeUsedYear ?? h.hcrisEndYear}) income − (${h.chowEventYearPlus1}) income = ${h.incomeDeltaLastMinusPost1}`
                                : `Need numeric income for both the last-year value and CHOW year + 1 to compute the change.`
                            }
                          >
                            {h.incomeDeltaLastMinusPost1}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.incomeDeltaLastMinusPre !== 'N/A'
                                ? `(${h.hcrisIncomeLastYearInRangeUsedYear ?? h.hcrisEndYear}) income − (${h.chowEventYearMinus1}) income = ${h.incomeDeltaLastMinusPre}`
                                : `Need numeric income for both the last-year value and CHOW year − 1 to compute the change.`
                            }
                          >
                            {h.incomeDeltaLastMinusPre}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.hcrisYearRange && h.hcrisYearRange !== 'N/A'
                                ? `Income for earliest year with data (${h.incomeFirstYearUsed ?? String(h.hcrisYearRange).split('–')[0]}): ${h.incomeFirstYear}`
                                : `Income for earliest year with data: ${h.incomeFirstYear}`
                            }
                          >
                            {h.incomeFirstYear}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.hcrisYearRange && h.hcrisYearRange !== 'N/A'
                                ? `Income for latest year with data (${h.incomeEndYearUsed ?? (h.hcrisEndYear ?? String(h.hcrisYearRange).split('–').slice(-1)[0])}): ${h.incomeEndYear}`
                                : `Income for latest year with data: ${h.incomeEndYear}`
                            }
                          >
                            {h.incomeEndYear}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.incomeEventYear !== 'N/A'
                                ? `Income for CHOW event year (${h.chowEventYear}): ${h.incomeEventYear}`
                                : `No HCRIS income found for CHOW event year (${h.chowEventYear}).`
                            }
                          >
                            {h.incomeEventYear}
                          </td>
                          <td
                            className="hc-num"
                            title={
                              h.incomeDeltaEventMinusPre !== 'N/A'
                                ? `(${h.chowEventYear}) income − (${h.chowEventYearMinus1}) income = ${h.incomeDeltaEventMinusPre}`
                                : `Need numeric income for both ${h.chowEventYear} and ${h.chowEventYearMinus1} to compute the change.`
                            }
                          >
                            {h.incomeDeltaEventMinusPre}
                          </td>
                          <td className="hc-num">{h.chowCount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ChartTakeaway label="Takeaway">
                  Each row is a name match with CHOW timing and HCRIS income windows; use it to audit outliers driving
                  the aggregate charts above.
                </ChartTakeaway>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

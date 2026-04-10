import { TAB_BAR_APPROX_PX } from './tabConstants'

export default function HospitalConsolidationTab() {
  return (
    <div
      style={{
        backgroundColor: '#f1f5f9',
        minHeight: `calc(100vh - ${TAB_BAR_APPROX_PX}px)`,
      }}
    />
  )
}

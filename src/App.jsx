import { useState } from 'react'
import HospitalCostReportTab from './tabs/HospitalCostReportTab'
import HospitalConsolidationTab from './tabs/HospitalConsolidationTab'
import ChangeOfOwnershipTab from './tabs/ChangeOfOwnershipTab'
import MedicarePartBGeoServicesTab from './tabs/MedicarePartBGeoServicesTab'
import { TAB_BAR_APPROX_PX } from './tabs/tabConstants'
import './App.css'

const TABS = [
  { id: 'cost-report', panelId: 'panel-cost-report', label: 'Hospital Cost Report Analysis' },
  { id: 'consolidation', panelId: 'panel-consolidation', label: 'Hospital Consolidation Effects' },
  { id: 'change-ownership', panelId: 'panel-change-ownership', label: 'Change Of Ownership' },
  { id: 'mup-geo-services', panelId: 'panel-mup-geo-services', label: 'Medicare Part B Geo Services' },
]

/** Keep inactive panels in layout with real width/height so Recharts does not reset when switching tabs. */
function tabPanelStyle(isActive) {
  return isActive
    ? {
        position: 'relative',
        zIndex: 1,
        width: '100%',
        opacity: 1,
        visibility: 'visible',
        pointerEvents: 'auto',
      }
    : {
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        width: '100%',
        opacity: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
        overflow: 'hidden',
      }
}

function App() {
  const [activeTab, setActiveTab] = useState('cost-report')

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav
        aria-label="Dataset views"
        role="tablist"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 4,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          padding: '0 16px',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: 'flex',
            maxWidth: 1400,
            margin: '0 auto',
            width: '100%',
            gap: 4,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-controls={tab.panelId}
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  margin: 0,
                  border: 'none',
                  cursor: 'pointer',
                  padding: '14px 18px',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: 'inherit',
                  background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: isActive ? '#fff' : '#94a3b8',
                  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'color 0.15s, background 0.15s',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>

      <div
        style={{
          position: 'relative',
          minHeight: `calc(100vh - ${TAB_BAR_APPROX_PX}px)`,
        }}
      >
        <div
          role="tabpanel"
          id="panel-cost-report"
          aria-labelledby="tab-cost-report"
          aria-hidden={activeTab !== 'cost-report'}
          style={tabPanelStyle(activeTab === 'cost-report')}
        >
          <HospitalCostReportTab />
        </div>
        <div
          role="tabpanel"
          id="panel-consolidation"
          aria-labelledby="tab-consolidation"
          aria-hidden={activeTab !== 'consolidation'}
          style={tabPanelStyle(activeTab === 'consolidation')}
        >
          <HospitalConsolidationTab />
        </div>
        <div
          role="tabpanel"
          id="panel-change-ownership"
          aria-labelledby="tab-change-ownership"
          aria-hidden={activeTab !== 'change-ownership'}
          style={tabPanelStyle(activeTab === 'change-ownership')}
        >
          <ChangeOfOwnershipTab />
        </div>
        <div
          role="tabpanel"
          id="panel-mup-geo-services"
          aria-labelledby="tab-mup-geo-services"
          aria-hidden={activeTab !== 'mup-geo-services'}
          style={tabPanelStyle(activeTab === 'mup-geo-services')}
        >
          <MedicarePartBGeoServicesTab />
        </div>
      </div>
    </div>
  )
}

export default App

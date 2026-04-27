import { NavLink, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/cost-analysis', label: 'Cost Analysis' },
  { to: '/consolidation', label: 'Consolidation' },
]

export function AppShell({ children }) {
  const location = useLocation()
  const isLanding = location.pathname === '/'

  return (
    <div className="app-shell">
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-grid" />
        <div className="ambient-orb ambient-orb-a" />
        <div className="ambient-orb ambient-orb-b" />
      </div>
      <header className="top-nav">
        <div className="top-nav-inner">
          <span className="brand-chip">Healthcare Consolidation VIP</span>
          <nav className="route-nav" aria-label="Main views">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `route-link${isActive ? ' active' : ''}`}
                end={item.to === '/'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className={`app-main${isLanding ? ' landing-main' : ''}`}>{children}</main>
    </div>
  )
}

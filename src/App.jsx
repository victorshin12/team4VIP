import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { StoryStateProvider } from './state/StoryStateContext'
import { ConsolidationPage } from './pages/ConsolidationPage'
import { CostAnalysisPage } from './pages/CostAnalysisPage'
import { LandingPage } from './pages/LandingPage'
import './styles/theme.css'

function App() {
  return (
    <StoryStateProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/cost-analysis" element={<CostAnalysisPage />} />
          <Route path="/consolidation" element={<ConsolidationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </StoryStateProvider>
  )
}

export default App

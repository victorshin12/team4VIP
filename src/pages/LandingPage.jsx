import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { RevealSection } from '../components/story/RevealSection'
import { usePrecomputedData } from '../hooks/usePrecomputedData'
import { SectionHeading, SurfaceCard } from '../components/ui/Surface'

const ENTRY_POINTS = [
  {
    title: 'Cost Analysis',
    route: '/cost-analysis',
    description: 'Explore hospital cost trends across the U.S.',
    tone: 'cost',
  },
  {
    title: 'Consolidation',
    route: '/consolidation',
    description: 'Track CHOW trends, geography, and market concentration.',
    tone: 'consolidation',
  },
]

export function LandingPage() {
  const { data } = usePrecomputedData('/precomputed/story_overview.json')
  const stats = useMemo(
    () => [
      { label: 'Hospitals covered', value: (data?.hospitals || 0).toLocaleString() },
      { label: 'Ownership events', value: (data?.ownershipEvents || 0).toLocaleString() },
      { label: 'Years explored', value: `${data?.minYear || 1996}-${data?.maxYear || 2024}` },
    ],
    [data],
  )

  return (
    <div className="landing-page">
      <section className="hero-section">
        <div className="hero-float-accent hero-float-a" aria-hidden="true" />
        <div className="hero-float-accent hero-float-b" aria-hidden="true" />
        <div className="hero-content">
          <p className="hero-kicker">Guided Data Documentary</p>
          <h1>Understanding U.S. Hospital Costs &amp; Consolidation</h1>
          <p>
            A visual exploration of hospital ownership, cost structures, and system evolution
            (1996-2024).
          </p>
          <a href="#entry-points" className="cta-button">
            Start Exploring
          </a>
          <div className="hero-inline-metrics">
            {stats.map((item) => (
              <span key={item.label}>
                <strong>{item.value}</strong> {item.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="story-flow">
        <RevealSection
          title="About the VIP: Health Care Consolidation Project"
          subtitle="This site supports Georgia Tech's Vertically Integrated Project focused on hospital merger intelligence."
          note="VIP = Vertically Integrated Project"
        >
          <div className="vip-feature">
            <p>
              The Health Care Consolidation Project brings together multidisciplinary collaborators to
              create and maintain an accurate, complete, publicly available, and timely panel database
              of U.S. hospital mergers.
            </p>
            <p>
              The research context spans financial market behavior and real-world healthcare delivery:
              teal-toned financial chart monitoring, complex spreadsheet-based evidence gathering, and
              high-stakes clinical environments where consolidation dynamics can shape care access.
            </p>
          </div>
          <div className="vip-columns">
            <div>
              <h4>Goals</h4>
              <p>
                Create and maintain an accurate, complete, publicly available, and timely panel
                database of U.S. hospital mergers.
              </p>
            </div>
            <div>
              <h4>Issues Involved or Addressed</h4>
              <p>
                Given the large number of hospital mergers over the last two decades, researchers need
                reliable and accessible merger data. Building this database requires determining the
                type, timing, and scope of historical deals and integrating many disparate ownership
                change sources. This project exists to create, maintain, and disseminate that merger
                database with a collaborative, multidisciplinary workflow.
              </p>
            </div>
          </div>
        </RevealSection>

        <RevealSection title="What is CMS Data?" subtitle="Three source streams power this guided experience.">
          <div className="glass-grid three">
            <SurfaceCard className="cms-card">
              <h3>Hospital Cost Reports (HCRIS)</h3>
              <p>Annual operating, revenue, and cost performance for U.S. hospitals.</p>
            </SurfaceCard>
            <SurfaceCard className="cms-card">
              <h3>Ownership Change Records</h3>
              <p>Buyer/seller ownership transitions used to map organizational movement.</p>
            </SurfaceCard>
            <SurfaceCard className="cms-card">
              <h3>Consolidation &amp; Systems Mapping</h3>
              <p>How independent facilities evolve into increasingly centralized systems.</p>
            </SurfaceCard>
          </div>
        </RevealSection>

        <RevealSection title="Why This Matters" subtitle="Signals visible in the data narrative.">
          <div className="sparkline-strip">
            <SurfaceCard>
              <h3>Rising healthcare costs</h3>
              <p>Cost inflation persists over the full period with distinct structural shocks.</p>
            </SurfaceCard>
            <SurfaceCard>
              <h3>Increasing consolidation</h3>
              <p>Large systems account for an increasing share of ownership transitions.</p>
            </SurfaceCard>
            <SurfaceCard>
              <h3>Fragmented ownership tracking</h3>
              <p>Transitions cross state lines and ownership chains grow harder to follow manually.</p>
            </SurfaceCard>
          </div>
        </RevealSection>

        <RevealSection title="How To Use This Site" subtitle="A guided progression through the analysis.">
          <ol className="timeline-guide">
            <li>Explore hospital cost trends and variability.</li>
            <li>Analyze the unified consolidation chapter for ownership change patterns.</li>
            <li>Compare timeline, geography, facility mix, and acquirer concentration.</li>
          </ol>
        </RevealSection>

        <RevealSection title="Entry Points" subtitle="Choose a chapter of the story." note="Scroll, pause, and take each chart one at a time.">
          <section id="entry-points" className="story-section">
            <div className="entry-panels">
              {ENTRY_POINTS.map((entry) => (
                <Link key={entry.route} to={entry.route} className={`entry-panel ${entry.tone}`}>
                  <h3>{entry.title}</h3>
                  <p>{entry.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </RevealSection>
      </div>
    </div>
  )
}

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
        <div className="hero-content">
          <h1>Healthcare Consolidation VIP</h1>
          <p>
            A visual exploration of U.S. hospital ownership, costs, and system evolution (1996-2024).
          </p>
          <a href="#entry-points" className="cta-button">
            Explore Data
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
        >
          <div className="vip-feature">
            <ul>
              <li>
                Builds and maintains a public, timely, and research-ready panel database of U.S.
                hospital mergers and ownership changes.
              </li>
              <li>
                Combines multidisciplinary work across data engineering, policy analysis, and health
                services research.
              </li>
              <li>
                Standardizes transaction type, timing, and scope so consolidation trends can be
                tracked consistently over time.
              </li>
              <li>
                Supports evidence-based research on how consolidation affects market structure, costs,
                and healthcare access.
              </li>
            </ul>
          </div>
          <div className="vip-columns">
            <div>
              <h4>Goals</h4>
              <ul>
                <li>Create and maintain a complete U.S. hospital merger panel.</li>
                <li>Improve data transparency for researchers and public stakeholders.</li>
                <li>Keep longitudinal records accurate, up to date, and reproducible.</li>
              </ul>
            </div>
            <div>
              <h4>Issues Involved or Addressed</h4>
              <ul>
                <li>Hospital deals are numerous and difficult to track manually across sources.</li>
                <li>Historical records often vary in naming, structure, and completeness.</li>
                <li>
                  Researchers need one harmonized dataset to analyze ownership change at national
                  scale.
                </li>
              </ul>
            </div>
          </div>
        </RevealSection>

        <RevealSection
          title="What is CMS Data?"
          subtitle="CMS publishes Medicare administrative data that supports policy, oversight, and research."
        >
          <div className="vip-feature">
            <ul>
              <li>
                The Centers for Medicare &amp; Medicaid Services (CMS) is the federal agency that
                administers Medicare and oversees major parts of the U.S. health coverage system.
              </li>
              <li>
                CMS datasets provide standardized information on providers, utilization, costs,
                reimbursement, enrollment, and ownership relationships.
              </li>
              <li>
                In this project, CMS data enables a longitudinal view of both hospital financial
                performance and ownership transitions.
              </li>
            </ul>
          </div>
          <div className="glass-grid">
            <SurfaceCard className="cms-card">
              <h3>HCRIS (Healthcare Cost Report Information System)</h3>
              <p>
                HCRIS contains annual Medicare cost report submissions from institutional providers.
                For hospitals, it includes facility characteristics, utilization measures, costs,
                charges, and financial statement fields that support trend analysis of revenue and cost
                structure over time.
              </p>
            </SurfaceCard>
            <SurfaceCard className="cms-card">
              <h3>CHOW (Hospital Change of Ownership)</h3>
              <p>
                The CHOW files are CMS public-use extracts derived from PECOS enrollment records and
                describe hospital ownership transactions, including buyer and seller entities, change
                type (CHOW, acquisition/merger, or consolidation), and effective dates. This is the
                core dataset for mapping consolidation activity.
              </p>
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

        <RevealSection title="Entry Points" subtitle="View the datasets." note="">
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

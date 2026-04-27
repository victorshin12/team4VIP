export function SurfaceCard({ children, className = '', full = false }) {
  return (
    <section className={`surface-card${full ? ' full' : ''} ${className}`.trim()}>
      {children}
    </section>
  )
}

export function SectionHeading({ title, subtitle }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  )
}

export function InsightList({ title, items }) {
  return (
    <section className="insight-box">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

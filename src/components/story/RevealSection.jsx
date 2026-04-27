import { useRevealOnScroll } from '../../hooks/useRevealOnScroll'

export function RevealSection({ title, subtitle, note, children }) {
  const { ref, visible } = useRevealOnScroll()

  return (
    <section ref={ref} className={`story-step${visible ? ' visible' : ''}`}>
      <header className="story-step-header">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
        {note ? <span className="story-step-note">{note}</span> : null}
      </header>
      <div className="story-step-body">{children}</div>
    </section>
  )
}

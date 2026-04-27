import { useEffect, useRef, useState } from 'react'

export function useRevealOnScroll() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ref.current || visible) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(ref.current)

    return () => observer.disconnect()
  }, [visible])

  return { ref, visible }
}

import { useEffect, useState } from 'react'

const cache = new Map()

function buildUrl(path) {
  return new URL(path, window.location.origin + import.meta.env.BASE_URL).toString()
}

export function usePrecomputedData(path) {
  const cached = cache.get(path)
  const [data, setData] = useState(cached ?? null)
  const [loading, setLoading] = useState(cached == null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    if (cache.has(path)) {
      Promise.resolve().then(() => {
        if (cancelled) return
        setData(cache.get(path))
        setLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    fetch(buildUrl(path))
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to fetch ${path} (${response.status})`)
        return response.json()
      })
      .then((payload) => {
        if (cancelled) return
        cache.set(path, payload)
        setData(payload)
        setLoading(false)
      })
      .catch((nextError) => {
        if (cancelled) return
        setError(nextError)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path])

  return { data, loading, error }
}

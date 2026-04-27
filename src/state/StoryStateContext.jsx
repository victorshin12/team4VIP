/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from 'react'

const StoryStateContext = createContext(null)

const DEFAULT_FILTERS = {
  hospitalType: 'ALL',
  state: 'ALL',
  ccnSearch: '',
}

export function StoryStateProvider({ children }) {
  const [selectedHospitalId, setSelectedHospitalId] = useState('')
  const [selectedSystemId, setSelectedSystemId] = useState('')
  const [activeYear, setActiveYear] = useState(2024)
  const [activeFilters, setActiveFilters] = useState(DEFAULT_FILTERS)

  const value = useMemo(
    () => ({
      selectedHospitalId,
      setSelectedHospitalId,
      selectedSystemId,
      setSelectedSystemId,
      activeYear,
      setActiveYear,
      activeFilters,
      setActiveFilters,
    }),
    [selectedHospitalId, selectedSystemId, activeYear, activeFilters],
  )

  return <StoryStateContext.Provider value={value}>{children}</StoryStateContext.Provider>
}

export function useStoryState() {
  const context = useContext(StoryStateContext)
  if (!context) {
    throw new Error('useStoryState must be used inside StoryStateProvider')
  }
  return context
}

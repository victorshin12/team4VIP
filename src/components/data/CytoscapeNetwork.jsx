import { useEffect, useMemo, useRef } from 'react'
import cytoscape from 'cytoscape'

const SYSTEM_COLORS = ['#22d3ee', '#2dd4bf', '#818cf8', '#f59e0b', '#f472b6', '#60a5fa']

function buildElements(nodes, edges, mode, highlightedNodeId) {
  const activeNodes = nodes.map((node, index) => ({
    data: {
      id: node.id,
      label: node.label,
      state: node.state,
      hospitalType: node.hospitalType || 'Unknown',
      systemId: node.systemId || `sys-${index % SYSTEM_COLORS.length}`,
      size: node.activityScore || 8,
      highlighted: node.id === highlightedNodeId ? 'yes' : 'no',
    },
  }))

  const nodeSet = new Set(activeNodes.map((node) => node.data.id))
  const activeEdges = edges
    .filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))
    .map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        year: edge.year,
        relationship: edge.relationship,
        merger: edge.relationship === 'ACQUISITION/MERGER' ? 1 : 0,
      },
      classes: mode === 'systems' && edge.relationship !== 'ACQUISITION/MERGER' ? 'muted' : '',
    }))

  return [...activeNodes, ...activeEdges]
}

export function CytoscapeNetwork({
  nodes,
  edges,
  mode = 'all',
  highlightedNodeId = '',
  onNodeSelect,
  className = '',
}) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const elements = useMemo(() => buildElements(nodes, edges, mode, highlightedNodeId), [nodes, edges, mode, highlightedNodeId])

  useEffect(() => {
    if (!containerRef.current) return
    if (cyRef.current) {
      cyRef.current.destroy()
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            color: '#dbeafe',
            'font-size': 9,
            'text-wrap': 'ellipsis',
            'text-max-width': 120,
            'background-color': (ele) => {
              const systemId = ele.data('systemId')
              const suffix = Number.parseInt(String(systemId).replace(/\D/g, ''), 10) || 0
              return SYSTEM_COLORS[suffix % SYSTEM_COLORS.length]
            },
            width: 'mapData(size, 0, 40, 12, 26)',
            height: 'mapData(size, 0, 40, 12, 26)',
            'border-color': '#0f172a',
            'border-width': 1.5,
          },
        },
        {
          selector: 'node[highlighted = "yes"]',
          style: {
            'border-color': '#f8fafc',
            'border-width': 3,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.2,
            'line-color': '#334155',
            'curve-style': 'bezier',
            opacity: 0.75,
          },
        },
        {
          selector: 'edge[merger = 1]',
          style: {
            'line-color': '#14b8a6',
            width: 2.2,
          },
        },
        {
          selector: '.muted',
          style: {
            opacity: 0.2,
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 450,
        nodeRepulsion: 9000,
        idealEdgeLength: 120,
      },
      wheelSensitivity: 0.2,
    })

    cy.on('tap', 'node', (event) => {
      const target = event.target.data()
      onNodeSelect?.(target.id)
    })

    cyRef.current = cy
    return () => {
      cy.destroy()
    }
  }, [elements, onNodeSelect])

  return <div className={`cy-network ${className}`.trim()} ref={containerRef} />
}

import React, {useState, useEffect} from 'react'
import MCPServerCard from './MCPServerCard'
import type {MCPServer} from '../types'

const GLASS_STYLES = {
  card: {
    background: 'var(--glass-medium)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--glass-border)',
    boxShadow: '0 2px 8px var(--glass-shadow)'
  }
}

export default function MCPServersSection() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      if (!window.mcpAPI) {
        setError('MCP API not available')
        setLoading(false)
        return
      }
      
      const response = await window.mcpAPI.getServers()
      
      if (response.error) {
        setError(response.error)
      } else {
        setServers(response.servers)
      }
    } catch (err) {
      console.error('Error loading MCP servers:', err)
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 rounded-lg p-4" style={GLASS_STYLES.card}>
        <h3 className="text-md font-medium" style={{color: 'var(--text-primary)'}}>
          MCP Servers
        </h3>
        <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
          Loading MCP server configurations...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-lg p-4" style={GLASS_STYLES.card}>
        <h3 className="text-md font-medium" style={{color: 'var(--text-primary)'}}>
          MCP Servers
        </h3>
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#EF4444'
          }}
        >
          <p className="font-medium mb-1">Error loading MCP servers</p>
          <p className="text-xs">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg p-4" style={GLASS_STYLES.card}>
      <div className="flex items-center justify-between">
        <h3 className="text-md font-medium" style={{color: 'var(--text-primary)'}}>
          MCP Servers
        </h3>
        <button
          onClick={loadServers}
          className="rounded-md px-3 py-1 text-xs font-medium transition-all duration-200 hover:scale-105"
          style={{
            background: 'var(--glass-light)',
            color: 'var(--text-primary)',
            border: '1px solid var(--glass-border)'
          }}
        >
          Refresh
        </button>
      </div>
      
      <p className="text-xs" style={{color: 'var(--text-muted)'}}>
        Configured MCP servers from .cursor/mcp.json and .windsurf/mcp.json
      </p>
      
      {servers.length === 0 ? (
        <div
          className="rounded-lg p-4 text-center"
          style={{
            background: 'var(--glass-light)',
            border: '1px solid var(--glass-border)'
          }}
        >
          <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
            No MCP servers configured
          </p>
          <p className="text-xs mt-1" style={{color: 'var(--text-muted)'}}>
            Add MCP server configurations to .cursor/mcp.json or .windsurf/mcp.json
          </p>
        </div>
      ) : (
        <div className="space-y-3 mt-3">
          {servers.map((server, index) => (
            <MCPServerCard key={`${server.source}-${server.name}-${index}`} server={server} />
          ))}
        </div>
      )}
    </div>
  )
}

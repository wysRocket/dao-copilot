import React from 'react'
import type {MCPServer} from '../types'

interface MCPServerCardProps {
  server: MCPServer
}

const GLASS_STYLES = {
  card: {
    background: 'var(--glass-medium)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--glass-border)',
    boxShadow: '0 2px 8px var(--glass-shadow)'
  }
}

export default function MCPServerCard({server}: MCPServerCardProps) {
  const sourceBadgeColor = server.source === 'cursor' ? '#60A5FA' : '#34D399'
  const sourceName = server.source === 'cursor' ? 'Cursor' : 'Windsurf'

  return (
    <div className="rounded-lg p-4 transition-all duration-200 hover:scale-[1.02]" style={GLASS_STYLES.card}>
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-semibold text-base" style={{color: 'var(--text-primary)'}}>
          {server.name}
        </h4>
        <span
          className="rounded-full px-2 py-1 text-xs font-medium"
          style={{
            backgroundColor: `${sourceBadgeColor}20`,
            color: sourceBadgeColor,
            border: `1px solid ${sourceBadgeColor}40`
          }}
        >
          {sourceName}
        </span>
      </div>
      
      <div className="space-y-2">
        <div>
          <label className="text-xs font-medium" style={{color: 'var(--text-muted)'}}>
            Command
          </label>
          <p
            className="text-sm mt-1 font-mono break-all"
            style={{color: 'var(--text-secondary)'}}
          >
            {server.command}
          </p>
        </div>
        
        {server.args && server.args.length > 0 && (
          <div>
            <label className="text-xs font-medium" style={{color: 'var(--text-muted)'}}>
              Arguments
            </label>
            <div className="mt-1 flex flex-wrap gap-1">
              {server.args.map((arg, index) => (
                <span
                  key={index}
                  className="rounded px-2 py-0.5 text-xs font-mono"
                  style={{
                    background: 'var(--glass-light)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--glass-border)'
                  }}
                >
                  {arg}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

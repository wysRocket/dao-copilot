import React, {useEffect, useState} from 'react'

/** Shape returned by TranscriptionStateManager.getStreamingDiagnostics */
interface StreamingDiagnostics {
  accumulatedLength: number
  lastPartial: string
  snapshots: number
  rawPartialsCount: number
  lastRawPartials: string[]
  stableId: string | null
  regressionGuardEnabled: boolean
}

interface BridgeDiagnostics {
  lengths?: number[]
  growthResets?: number
  lastLength?: number
  resetEvents?: Array<{before: number; after: number; ts: number}>
}

interface Props {
  /** Function returning current streaming diagnostics */
  fetchStreaming: () => StreamingDiagnostics | null
  /** Function returning bridge diagnostics */
  fetchBridge?: () => BridgeDiagnostics | null
  /** Poll interval ms */
  interval?: number
  /** Show raw partial tail */
  showRawTail?: boolean
  /** Allow toggling regression guard */
  onToggleRegressionGuard?: (enabled: boolean) => void
}

export const StreamingDiagnosticsPanel: React.FC<Props> = ({
  fetchStreaming,
  fetchBridge,
  interval = 1000,
  showRawTail = true,
  onToggleRegressionGuard
}) => {
  const [streaming, setStreaming] = useState<StreamingDiagnostics | null>(null)
  const [bridge, setBridge] = useState<BridgeDiagnostics | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      try {
        setStreaming(fetchStreaming())
        setBridge(fetchBridge ? fetchBridge() : null)
      } catch (e) {
        console.warn('StreamingDiagnosticsPanel poll error', e)
      }
    }, interval)
    return () => clearInterval(id)
  }, [fetchStreaming, fetchBridge, interval])

  if (!streaming) return <div className="text-xs text-gray-500">No streaming diagnostics yet.</div>

  const {
    accumulatedLength,
    lastPartial,
    snapshots,
    rawPartialsCount,
    lastRawPartials,
    stableId,
    regressionGuardEnabled
  } = streaming

  const recentRaw = showRawTail ? lastRawPartials : []

  return (
    <div className="max-w-full space-y-1 overflow-auto rounded border bg-gray-50 p-2 font-mono text-xs">
      <div className="font-semibold">Streaming Diagnostics</div>
      <div>accumulatedLength: {accumulatedLength}</div>
      <div>lastPartialLength: {lastPartial.length}</div>
      <div>snapshots: {snapshots}</div>
      <div>rawPartialsCount: {rawPartialsCount}</div>
      <div>stableId: {stableId ?? '—'}</div>
      <div className="flex items-center gap-2">
        <span>regressionGuard: {regressionGuardEnabled ? 'ON' : 'off'}</span>
        {onToggleRegressionGuard && (
          <button
            onClick={() => onToggleRegressionGuard(!regressionGuardEnabled)}
            className="rounded border bg-white px-1 py-0.5 hover:bg-gray-100"
          >
            toggle
          </button>
        )}
      </div>
      {bridge && (
        <div className="border-t border-gray-200 pt-1">
          <div className="font-semibold">Bridge</div>
          <div>growthResets: {bridge.growthResets ?? 0}</div>
          <div>lastLength: {bridge.lastLength ?? '—'}</div>
          {bridge.resetEvents?.length ? (
            <div>
              recentResets:{' '}
              {bridge.resetEvents
                .slice(-5)
                .map(r => `${r.before}->${r.after}`)
                .join(', ')}
            </div>
          ) : null}
        </div>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer">Last Partial Text (truncated)</summary>
        <div className="max-h-40 overflow-auto break-words whitespace-pre-wrap">
          {lastPartial.slice(0, 2000)}
          {lastPartial.length > 2000 ? '…' : ''}
        </div>
      </details>
      {recentRaw.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer">Raw Tail ({recentRaw.length})</summary>
          <ol className="max-h-40 list-inside list-decimal space-y-0.5 overflow-auto">
            {recentRaw.map((p, i) => (
              <li key={i}>
                {p.length}: <span className="text-gray-700">{p}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

export default StreamingDiagnosticsPanel

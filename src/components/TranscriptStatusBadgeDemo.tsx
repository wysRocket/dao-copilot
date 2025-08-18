/**
 * TranscriptStatusBadge Demo & Test Component
 * Demonstrates all status variants and interactive features
 */

import React, {useState, useCallback} from 'react'
import {
  TranscriptStatusBadge,
  TranscriptStatusPresets,
  TranscriptStatusUtils,
  useTranscriptStatus,
  type TranscriptStatus,
  type BadgeSize,
  type BadgeVariant
} from './TranscriptStatusBadge'

export const TranscriptStatusBadgeDemo: React.FC = () => {
  const [selectedStatus, setSelectedStatus] = useState<TranscriptStatus>('normal')
  const [selectedSize, setSelectedSize] = useState<BadgeSize>('md')
  const [selectedVariant, setSelectedVariant] = useState<BadgeVariant>('solid')
  const [showIcon, setShowIcon] = useState(true)
  const [showText, setShowText] = useState(true)
  const [enablePulse, setEnablePulse] = useState(false)

  // Simulate transcript state for useTranscriptStatus hook
  const [isStreaming, setIsStreaming] = useState(false)
  const [isConnected, setIsConnected] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isRecovered, setIsRecovered] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  const autoStatus = useTranscriptStatus(
    isStreaming,
    isConnected,
    hasError,
    isRecovered,
    isBuffering,
    isPaused
  )

  const handleStatusClick = useCallback((status: TranscriptStatus) => {
    console.log(`Status badge clicked: ${status}`)
  }, [])

  const allStatuses: TranscriptStatus[] = [
    'normal',
    'streaming',
    'recovered',
    'fallback',
    'degraded',
    'offline',
    'error',
    'buffering',
    'reconnecting',
    'paused'
  ]

  const allSizes: BadgeSize[] = ['sm', 'md', 'lg']
  const allVariants: BadgeVariant[] = ['solid', 'outline', 'soft']

  return (
    <div className="min-h-screen space-y-8 bg-gray-50 p-6">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          🏷️ TranscriptStatusBadge Component
        </h2>

        {/* Interactive Configuration */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Status Type</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value as TranscriptStatus)}
              className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
            >
              {allStatuses.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Size</label>
            <select
              value={selectedSize}
              onChange={e => setSelectedSize(e.target.value as BadgeSize)}
              className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
            >
              {allSizes.map(size => (
                <option key={size} value={size}>
                  {size.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Variant</label>
            <select
              value={selectedVariant}
              onChange={e => setSelectedVariant(e.target.value as BadgeVariant)}
              className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
            >
              {allVariants.map(variant => (
                <option key={variant} value={variant}>
                  {variant.charAt(0).toUpperCase() + variant.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Options</label>
            <div className="space-y-1">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showIcon}
                  onChange={e => setShowIcon(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Show Icon</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showText}
                  onChange={e => setShowText(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Show Text</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={enablePulse}
                  onChange={e => setEnablePulse(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Enable Pulse</span>
              </label>
            </div>
          </div>
        </div>

        {/* Interactive Badge Preview */}
        <div className="mb-8 rounded-lg border bg-gray-50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Preview (Click to Test Interaction)
          </h3>
          <div className="flex items-center justify-center rounded border bg-white p-8">
            <TranscriptStatusBadge
              status={selectedStatus}
              size={selectedSize}
              variant={selectedVariant}
              showIcon={showIcon}
              showText={showText}
              pulse={enablePulse}
              onClick={() => handleStatusClick(selectedStatus)}
              className="shadow-md"
            />
          </div>

          {/* Status Information */}
          <div className="mt-4 space-y-1 text-sm text-gray-600">
            <div>
              <strong>Status:</strong> {selectedStatus}
            </div>
            <div>
              <strong>Critical:</strong>{' '}
              {TranscriptStatusUtils.isStatusCritical(selectedStatus) ? 'Yes' : 'No'}
            </div>
            <div>
              <strong>Warning:</strong>{' '}
              {TranscriptStatusUtils.isStatusWarning(selectedStatus) ? 'Yes' : 'No'}
            </div>
            <div>
              <strong>Colors:</strong>{' '}
              {TranscriptStatusUtils.getStatusColors(selectedStatus, selectedVariant)}
            </div>
          </div>
        </div>
      </div>

      {/* All Status Types Grid */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">All Status Types</h3>

        <div className="space-y-6">
          {allVariants.map(variant => (
            <div key={variant}>
              <h4 className="mb-3 text-lg font-medium text-gray-700 capitalize">
                {variant} Variant
              </h4>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {allStatuses.map(status => (
                  <div key={status} className="space-y-2 text-center">
                    <div className="flex justify-center">
                      <TranscriptStatusBadge
                        status={status}
                        variant={variant}
                        size="md"
                        onClick={() => handleStatusClick(status)}
                      />
                    </div>
                    <div className="text-xs text-gray-500 capitalize">{status}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Size Variations */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Size Variations</h3>

        <div className="space-y-4">
          {allSizes.map(size => (
            <div key={size} className="flex items-center space-x-4">
              <div className="w-16 text-sm font-medium text-gray-700 uppercase">{size}</div>
              <div className="flex items-center space-x-2">
                <TranscriptStatusBadge status="normal" size={size} />
                <TranscriptStatusBadge status="streaming" size={size} pulse />
                <TranscriptStatusBadge status="error" size={size} />
                <TranscriptStatusBadge status="buffering" size={size} pulse />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preset Components Demo */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Preset Components</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2 text-center">
            {TranscriptStatusPresets.normal()}
            <div className="text-xs text-gray-500">Normal</div>
          </div>

          <div className="space-y-2 text-center">
            {TranscriptStatusPresets.streaming()}
            <div className="text-xs text-gray-500">Streaming</div>
          </div>

          <div className="space-y-2 text-center">
            {TranscriptStatusPresets.recovered()}
            <div className="text-xs text-gray-500">Recovered</div>
          </div>

          <div className="space-y-2 text-center">
            {TranscriptStatusPresets.fallback()}
            <div className="text-xs text-gray-500">Fallback</div>
          </div>

          <div className="space-y-2 text-center">
            {TranscriptStatusPresets.error()}
            <div className="text-xs text-gray-500">Error</div>
          </div>
        </div>
      </div>

      {/* useTranscriptStatus Hook Demo */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">useTranscriptStatus Hook Demo</h3>

        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isStreaming}
              onChange={e => setIsStreaming(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Is Streaming</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isConnected}
              onChange={e => setIsConnected(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Is Connected</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={hasError}
              onChange={e => setHasError(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Has Error</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isRecovered}
              onChange={e => setIsRecovered(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Is Recovered</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isBuffering}
              onChange={e => setIsBuffering(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Is Buffering</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isPaused}
              onChange={e => setIsPaused(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Is Paused</span>
          </label>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-sm font-medium text-gray-700">Auto-determined Status:</div>
          <TranscriptStatusBadge
            status={autoStatus}
            pulse={['streaming', 'buffering', 'reconnecting'].includes(autoStatus)}
          />
          <div className="text-sm text-gray-600">({autoStatus})</div>
        </div>
      </div>

      {/* Accessibility Features */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Accessibility Features</h3>

        <div className="space-y-4">
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-700">
              ARIA Labels & Screen Reader Support
            </h4>
            <div className="flex items-center space-x-2">
              <TranscriptStatusBadge
                status="error"
                ariaLabel="Custom aria label: Critical transcription error detected"
              />
              <div className="text-sm text-gray-600">Custom ARIA label example</div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-700">
              Keyboard Navigation (Tab + Enter/Space)
            </h4>
            <div className="flex items-center space-x-2">
              <TranscriptStatusBadge
                status="streaming"
                onClick={() => alert('Keyboard activated!')}
                pulse
              />
              <div className="text-sm text-gray-600">
                Try tabbing to this badge and pressing Enter or Space
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-700">
              High Contrast & Color-blind Friendly
            </h4>
            <div className="flex items-center space-x-2">
              <TranscriptStatusBadge status="normal" variant="outline" />
              <TranscriptStatusBadge status="error" variant="outline" />
              <TranscriptStatusBadge status="fallback" variant="outline" />
              <div className="text-sm text-gray-600">Outline variant for better contrast</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TranscriptStatusBadgeDemo

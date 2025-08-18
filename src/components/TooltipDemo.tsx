/**
 * Tooltip Demo Component
 * Demonstrates tooltip system with status indicators and various configurations
 */

import React, {useState} from 'react'
import {TranscriptStatusBadge, type TranscriptStatus} from './TranscriptStatusBadge'
import {Tooltip, TooltipPresets, STATUS_EXPLANATIONS} from './TooltipSystem'

export const TooltipDemo: React.FC = () => {
  const [selectedStatus, setSelectedStatus] = useState<TranscriptStatus>('normal')
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  const allStatuses: TranscriptStatus[] = [
    'normal',
    'streaming',
    'buffering',
    'recovered',
    'fallback',
    'degraded',
    'reconnecting',
    'error',
    'offline',
    'paused'
  ]

  return (
    <div className="min-h-screen space-y-8 bg-gray-50 p-6">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">💡 Tooltip System Demo</h2>

        {/* Controls */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Selected Status</label>
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

          <div className="flex items-end">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showTechnicalDetails}
                onChange={e => setShowTechnicalDetails(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Show Technical Details</span>
            </label>
          </div>
        </div>
      </div>

      {/* Status Badge Tooltips */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Status Badge Tooltips</h3>

        <div className="space-y-6">
          {/* All Status Badges Grid */}
          <div>
            <h4 className="mb-3 text-lg font-medium text-gray-700">
              All Status Types (Hover for tooltips)
            </h4>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {allStatuses.map(status => (
                <div key={status} className="rounded border bg-gray-50 p-4 text-center">
                  <div className="mb-2 flex justify-center">
                    <TranscriptStatusBadge
                      status={status}
                      enableTooltip={true}
                      showTechnicalDetails={showTechnicalDetails}
                      size="md"
                    />
                  </div>
                  <div className="text-xs text-gray-500 capitalize">{status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Size Variations */}
          <div>
            <h4 className="mb-3 text-lg font-medium text-gray-700">Size Variations</h4>
            <div className="flex items-center justify-center gap-6 rounded border bg-gray-50 p-6">
              <div className="text-center">
                <div className="mb-2">
                  <TranscriptStatusBadge
                    status={selectedStatus}
                    size="sm"
                    enableTooltip={true}
                    showTechnicalDetails={showTechnicalDetails}
                  />
                </div>
                <div className="text-xs text-gray-500">Small</div>
              </div>

              <div className="text-center">
                <div className="mb-2">
                  <TranscriptStatusBadge
                    status={selectedStatus}
                    size="md"
                    enableTooltip={true}
                    showTechnicalDetails={showTechnicalDetails}
                  />
                </div>
                <div className="text-xs text-gray-500">Medium</div>
              </div>

              <div className="text-center">
                <div className="mb-2">
                  <TranscriptStatusBadge
                    status={selectedStatus}
                    size="lg"
                    enableTooltip={true}
                    showTechnicalDetails={showTechnicalDetails}
                  />
                </div>
                <div className="text-xs text-gray-500">Large</div>
              </div>
            </div>
          </div>

          {/* Variant Styles */}
          <div>
            <h4 className="mb-3 text-lg font-medium text-gray-700">Style Variants</h4>
            <div className="flex items-center justify-center gap-6 rounded border bg-gray-50 p-6">
              <div className="text-center">
                <div className="mb-2">
                  <TranscriptStatusBadge
                    status={selectedStatus}
                    variant="solid"
                    enableTooltip={true}
                    showTechnicalDetails={showTechnicalDetails}
                  />
                </div>
                <div className="text-xs text-gray-500">Solid</div>
              </div>

              <div className="text-center">
                <div className="mb-2">
                  <TranscriptStatusBadge
                    status={selectedStatus}
                    variant="outline"
                    enableTooltip={true}
                    showTechnicalDetails={showTechnicalDetails}
                  />
                </div>
                <div className="text-xs text-gray-500">Outline</div>
              </div>

              <div className="text-center">
                <div className="mb-2">
                  <TranscriptStatusBadge
                    status={selectedStatus}
                    variant="soft"
                    enableTooltip={true}
                    showTechnicalDetails={showTechnicalDetails}
                  />
                </div>
                <div className="text-xs text-gray-500">Soft</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Tooltip Examples */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Custom Tooltip Examples</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Help Tooltip */}
          <div className="rounded border border-blue-200 bg-blue-50 p-4 text-center">
            <Tooltip
              content="This is a help tooltip with quick information"
              config={TooltipPresets.help}
            >
              <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                Help Tooltip
              </button>
            </Tooltip>
            <div className="mt-2 text-xs text-blue-700">Quick help info</div>
          </div>

          {/* Info Tooltip */}
          <div className="rounded border border-green-200 bg-green-50 p-4 text-center">
            <Tooltip
              content={
                <div className="space-y-2">
                  <h4 className="font-semibold">Detailed Information</h4>
                  <p>
                    This tooltip contains more detailed information with multiple paragraphs and
                    rich content.
                  </p>
                  <ul className="space-y-1 text-sm">
                    <li>• Feature 1: Advanced functionality</li>
                    <li>• Feature 2: Performance optimization</li>
                    <li>• Feature 3: Accessibility support</li>
                  </ul>
                </div>
              }
              config={TooltipPresets.info}
            >
              <button className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:outline-none">
                Info Tooltip
              </button>
            </Tooltip>
            <div className="mt-2 text-xs text-green-700">Detailed info</div>
          </div>

          {/* Warning Tooltip */}
          <div className="rounded border border-yellow-200 bg-yellow-50 p-4 text-center">
            <Tooltip
              content="⚠️ This action requires careful consideration and may have consequences"
              config={TooltipPresets.warning}
            >
              <button className="rounded bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-500 focus:outline-none">
                Warning Tooltip
              </button>
            </Tooltip>
            <div className="mt-2 text-xs text-yellow-700">Warning message</div>
          </div>
        </div>

        {/* Interactive Element Examples */}
        <div className="mt-8 space-y-4">
          <h4 className="text-lg font-medium text-gray-700">Interactive Elements with Tooltips</h4>

          <div className="flex flex-wrap gap-4">
            <Tooltip content="This input field accepts transcript search queries">
              <input
                type="text"
                placeholder="Search transcripts..."
                className="rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              />
            </Tooltip>

            <Tooltip content="Toggle between light and dark theme modes">
              <button className="rounded bg-gray-200 p-2 text-gray-700 hover:bg-gray-300">
                🌓 Theme
              </button>
            </Tooltip>

            <Tooltip content="Download current transcript as PDF or text file">
              <button className="rounded bg-purple-600 p-2 text-white hover:bg-purple-700">
                📄 Download
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Status Explanations Reference */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Status Explanations Reference</h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {allStatuses.map(status => {
            const explanation = STATUS_EXPLANATIONS[status]
            return (
              <div key={status} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xl">{explanation.icon}</span>
                  <h4 className="font-medium text-gray-900">{explanation.title}</h4>
                  <TranscriptStatusBadge status={status} size="sm" enableTooltip={false} />
                </div>
                <p className="text-sm text-gray-600">{explanation.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Accessibility Information */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Accessibility Features</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 font-medium text-gray-800">Tooltip Accessibility</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Screen reader compatible with proper ARIA attributes</li>
              <li>• Keyboard navigation support (Tab, Enter, Space)</li>
              <li>• Focus management during tooltip transitions</li>
              <li>• Respects prefers-reduced-motion setting</li>
              <li>• High contrast color schemes</li>
              <li>• Touch-friendly interaction on mobile devices</li>
            </ul>
          </div>

          <div>
            <h4 className="mb-2 font-medium text-gray-800">Status Badge Accessibility</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Semantic role=&quot;status&quot; for status indicators</li>
              <li>• Clear aria-label descriptions for each status</li>
              <li>• Color-blind friendly icon + text combinations</li>
              <li>• Sufficient color contrast ratios</li>
              <li>• Consistent visual hierarchy and spacing</li>
              <li>• Keyboard interaction for clickable badges</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TooltipDemo

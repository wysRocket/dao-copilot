/**
 * Smooth Transitions Demo Component
 * Demonstrates transition system with transcript status changes and UI animations
 */

import React, {useState, useEffect, useCallback} from 'react'
import {
  TransitionWrapper,
  AnimatedStatusBadge,
  TransitionList,
  PageTransition,
  StatusTransitions,
  TransitionUtils,
  type TransitionType,
  type TransitionDuration
} from './TransitionSystem'
import {TranscriptStatusBadge, type TranscriptStatus} from './TranscriptStatusBadge'

export const SmoothTransitionsDemo: React.FC = () => {
  const [currentStatus, setCurrentStatus] = useState<TranscriptStatus>('normal')
  const [previousStatus, setPreviousStatus] = useState<TranscriptStatus>('normal')
  const [showTransitionDemo, setShowTransitionDemo] = useState(true)
  const [selectedTransition, setSelectedTransition] = useState<TransitionType>('fade')
  const [selectedDuration, setSelectedDuration] = useState<TransitionDuration>('normal')
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [pageError, setPageError] = useState<Error | null>(null)
  const [transcriptEntries, setTranscriptEntries] = useState<string[]>([
    'Initial transcript entry',
    'Second entry with some content',
    'Third entry for demonstration'
  ])

  // Auto-cycle through statuses for demonstration
  const [autoCycle, setAutoCycle] = useState(false)

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

  const allTransitions: TransitionType[] = [
    'fade',
    'slide-up',
    'slide-down',
    'slide-left',
    'slide-right',
    'scale',
    'bounce',
    'pulse',
    'shake',
    'glow',
    'flip',
    'rotate'
  ]

  const allDurations: TransitionDuration[] = ['fast', 'normal', 'slow']

  useEffect(() => {
    if (!autoCycle) return

    const interval = setInterval(() => {
      setPreviousStatus(currentStatus)
      setCurrentStatus(current => {
        const currentIndex = allStatuses.indexOf(current)
        const nextIndex = (currentIndex + 1) % allStatuses.length
        return allStatuses[nextIndex]
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [autoCycle, currentStatus, allStatuses])

  const handleStatusChange = useCallback(
    (newStatus: TranscriptStatus) => {
      setPreviousStatus(currentStatus)
      setCurrentStatus(newStatus)
    },
    [currentStatus]
  )

  const addTranscriptEntry = useCallback(() => {
    const newEntry = `New transcript entry ${transcriptEntries.length + 1} - ${new Date().toLocaleTimeString()}`
    setTranscriptEntries(prev => [...prev, newEntry])
  }, [transcriptEntries.length])

  const clearTranscriptEntries = useCallback(() => {
    setTranscriptEntries([])
  }, [])

  const simulatePageError = () => {
    setPageError(new Error('Simulated page error for transition demo'))
    setTimeout(() => setPageError(null), 3000)
  }

  const simulatePageLoading = () => {
    setIsPageLoading(true)
    setTimeout(() => setIsPageLoading(false), 2000)
  }

  return (
    <div className="min-h-screen space-y-8 bg-gray-50 p-6">
      {/* Page Transition Demo */}
      <PageTransition isLoading={isPageLoading} error={pageError}>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-2xl font-bold text-gray-900">🎬 Smooth Transitions Demo</h2>

          {/* Controls */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Current Status</label>
              <select
                value={currentStatus}
                onChange={e => handleStatusChange(e.target.value as TranscriptStatus)}
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
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Transition Type
              </label>
              <select
                value={selectedTransition}
                onChange={e => setSelectedTransition(e.target.value as TransitionType)}
                className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
              >
                {allTransitions.map(transition => (
                  <option key={transition} value={transition}>
                    {transition.charAt(0).toUpperCase() + transition.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Duration</label>
              <select
                value={selectedDuration}
                onChange={e => setSelectedDuration(e.target.value as TransitionDuration)}
                className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500"
              >
                {allDurations.map(duration => (
                  <option key={duration} value={duration}>
                    {duration.charAt(0).toUpperCase() + duration.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => setAutoCycle(!autoCycle)}
              className={`rounded px-4 py-2 font-medium text-white ${
                autoCycle ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {autoCycle ? 'Stop Auto Cycle' : 'Start Auto Cycle'}
            </button>

            <button
              onClick={() => setShowTransitionDemo(!showTransitionDemo)}
              className="rounded bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700"
            >
              Toggle Transition Demo
            </button>

            <button
              onClick={simulatePageLoading}
              className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Simulate Loading
            </button>

            <button
              onClick={simulatePageError}
              className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
            >
              Simulate Error
            </button>
          </div>
        </div>
      </PageTransition>

      {/* Status Badge Transition Demo */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Status Badge Transitions</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Enhanced Badge with Transitions */}
          <div className="space-y-4 text-center">
            <h4 className="text-lg font-medium text-gray-700">Enhanced Badge (with transitions)</h4>
            <div className="flex justify-center rounded border bg-gray-50 p-8">
              <TranscriptStatusBadge
                status={currentStatus}
                previousStatus={previousStatus}
                enableTransitions={true}
                size="lg"
                pulse={['streaming', 'buffering', 'reconnecting'].includes(currentStatus)}
              />
            </div>
            <div className="text-sm text-gray-600">
              <div>
                <strong>Current:</strong> {currentStatus}
              </div>
              <div>
                <strong>Previous:</strong> {previousStatus}
              </div>
            </div>
          </div>

          {/* Standard Badge without Transitions */}
          <div className="space-y-4 text-center">
            <h4 className="text-lg font-medium text-gray-700">Standard Badge (no transitions)</h4>
            <div className="flex justify-center rounded border bg-gray-50 p-8">
              <TranscriptStatusBadge
                status={currentStatus}
                enableTransitions={false}
                size="lg"
                pulse={['streaming', 'buffering', 'reconnecting'].includes(currentStatus)}
              />
            </div>
            <div className="text-sm text-gray-600">Notice the difference in smoothness</div>
          </div>
        </div>
      </div>

      {/* Custom Transition Demo */}
      <TransitionWrapper
        show={showTransitionDemo}
        config={{
          type: selectedTransition,
          duration: selectedDuration,
          easing: 'ease-in-out'
        }}
      >
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-xl font-semibold text-gray-900">
            Custom Transition: {selectedTransition} ({selectedDuration})
          </h3>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {allStatuses.slice(0, 5).map((status, index) => (
              <div key={status} className="text-center">
                <TranscriptStatusBadge
                  status={status}
                  enableTransitions={true}
                  transitionConfig={{
                    type: selectedTransition,
                    duration: selectedDuration,
                    delay: TransitionUtils.createStaggeredDelay(index, 0, 100)
                  }}
                />
                <div className="mt-1 text-xs text-gray-500 capitalize">{status}</div>
              </div>
            ))}
          </div>
        </div>
      </TransitionWrapper>

      {/* Transcript List Transitions */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Transcript List Transitions</h3>
          <div className="space-x-2">
            <button
              onClick={addTranscriptEntry}
              className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
            >
              Add Entry
            </button>
            <button
              onClick={clearTranscriptEntries}
              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
            >
              Clear All
            </button>
          </div>
        </div>

        <TransitionList
          itemConfig={StatusTransitions.newTranscript}
          staggerDelay={100}
          className="space-y-2"
        >
          {transcriptEntries.map((entry, index) => (
            <div
              key={index}
              className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
            >
              {entry}
            </div>
          ))}
        </TransitionList>

        {transcriptEntries.length === 0 && (
          <div className="py-8 text-center text-gray-500">
            No transcript entries. Click "Add Entry" to see list transitions.
          </div>
        )}
      </div>

      {/* Transition Performance Info */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold text-gray-900">Transition System Features</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 font-medium text-gray-800">Performance Optimized</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Hardware-accelerated CSS transitions</li>
              <li>• Minimal DOM manipulation</li>
              <li>• Respects prefers-reduced-motion</li>
              <li>• No layout thrashing</li>
              <li>• Efficient re-render cycles</li>
            </ul>
          </div>

          <div>
            <h4 className="mb-2 font-medium text-gray-800">Accessibility Features</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Reduced motion support</li>
              <li>• Screen reader friendly</li>
              <li>• Focus management during transitions</li>
              <li>• ARIA attributes preserved</li>
              <li>• Keyboard navigation maintained</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 rounded border border-yellow-200 bg-yellow-50 p-3">
          <div className="flex items-center">
            <span className="mr-2 text-yellow-600">⚡</span>
            <div className="text-sm">
              <strong>Reduced Motion:</strong>{' '}
              {TransitionUtils.shouldReduceMotion() ? 'Enabled' : 'Disabled'}
              {TransitionUtils.shouldReduceMotion() && (
                <span className="ml-2 text-yellow-700">
                  (Transitions are automatically optimized for accessibility)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SmoothTransitionsDemo

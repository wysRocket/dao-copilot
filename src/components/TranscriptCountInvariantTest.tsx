/**
 * Development Test Component for Transcript Count Invariant System
 * This component tests various transcript count scenarios to validate the invariant check
 */

import React, {useState} from 'react'
import {
  TranscriptCountInvariant,
  TranscriptCountValidation,
  useTranscriptCountInvariant,
  TranscriptCountMismatch
} from '../utils/transcript-count-invariant'
import {useTranscriptStore, transcriptSelectors} from '../state/transcript-state'

interface TestScenario {
  id: string
  name: string
  description: string
  test: () => TranscriptCountMismatch | null
  expected: 'pass' | 'fail'
}

export const TranscriptCountInvariantTest: React.FC = () => {
  const [testResults, setTestResults] = useState<
    Record<string, {result: TranscriptCountMismatch | null; passed: boolean}>
  >({})
  const [isRunning, setIsRunning] = useState(false)

  // Get current store state for testing
  const recentEntries = useTranscriptStore(state => state.recentEntries)
  const filteredEntries = useTranscriptStore(transcriptSelectors.filteredEntries)
  const isStreaming = useTranscriptStore(state => state.isStreaming)

  // Test the hook itself
  const mismatchFromHook = useTranscriptCountInvariant(
    'TranscriptCountInvariantTest',
    recentEntries.length
  )

  // Test scenarios to validate the invariant system
  const testScenarios: TestScenario[] = [
    {
      id: 'correct-count',
      name: 'Correct Count Test',
      description: 'UI count matches store count exactly',
      test: () =>
        TranscriptCountValidation.validateDisplayCount('CorrectCountTest', recentEntries.length),
      expected: 'pass'
    },
    {
      id: 'incorrect-count-high',
      name: 'Incorrect Count (High)',
      description: 'UI count is higher than store count',
      test: () =>
        TranscriptCountValidation.validateDisplayCount(
          'IncorrectCountHighTest',
          recentEntries.length + 5
        ),
      expected: 'fail'
    },
    {
      id: 'incorrect-count-low',
      name: 'Incorrect Count (Low)',
      description: 'UI count is lower than store count',
      test: () =>
        TranscriptCountValidation.validateDisplayCount(
          'IncorrectCountLowTest',
          Math.max(0, recentEntries.length - 3)
        ),
      expected: 'fail'
    },
    {
      id: 'filtered-correct',
      name: 'Filtered Count Correct',
      description: 'Filtered UI count matches filtered store count',
      test: () =>
        TranscriptCountValidation.validateFilteredCount(
          'FilteredCorrectTest',
          filteredEntries.length
        ),
      expected: 'pass'
    },
    {
      id: 'filtered-incorrect',
      name: 'Filtered Count Incorrect',
      description: 'Filtered UI count does not match filtered store count',
      test: () =>
        TranscriptCountValidation.validateFilteredCount(
          'FilteredIncorrectTest',
          filteredEntries.length + 2
        ),
      expected: 'fail'
    },
    {
      id: 'both-counts',
      name: 'Both Counts Test',
      description: 'Test both display and filtered counts together',
      test: () => {
        const {displayMismatch, filteredMismatch} = TranscriptCountValidation.validateBothCounts(
          'BothCountsTest',
          recentEntries.length,
          filteredEntries.length
        )
        return displayMismatch || filteredMismatch
      },
      expected: 'pass'
    },
    {
      id: 'assertion-pass',
      name: 'Assertion Pass Test',
      description: 'Assertion should pass with correct count',
      test: () => {
        try {
          const assert = TranscriptCountValidation.createAssertion('AssertionPassTest')
          assert(recentEntries.length)
          return null // No mismatch = pass
        } catch (error) {
          return {
            componentName: 'AssertionPassTest',
            uiCount: recentEntries.length,
            storeCount: recentEntries.length,
            storeFilteredCount: filteredEntries.length,
            timestamp: Date.now(),
            additionalInfo: {error: error instanceof Error ? error.message : 'Unknown error'}
          } as TranscriptCountMismatch
        }
      },
      expected: 'pass'
    }
  ]

  const runTests = async () => {
    setIsRunning(true)
    const results: Record<string, {result: TranscriptCountMismatch | null; passed: boolean}> = {}

    for (const scenario of testScenarios) {
      try {
        const result = scenario.test()
        const passed = scenario.expected === 'pass' ? result === null : result !== null
        results[scenario.id] = {result, passed}

        // Small delay to see progress
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Test ${scenario.id} failed with error:`, error)
        results[scenario.id] = {
          result: null,
          passed: false
        }
      }
    }

    setTestResults(results)
    setIsRunning(false)
  }

  const clearMismatches = () => {
    TranscriptCountInvariant.clearMismatches()
    setTestResults({})
  }

  const stats = TranscriptCountInvariant.getMismatchStats()

  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-yellow-800">
          Transcript Count Invariant Test is only available in development mode.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 rounded-lg bg-gray-50 p-6">
      <div className="rounded border bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          🔍 Transcript Count Invariant Test
        </h3>

        <div className="mb-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div className="rounded border bg-blue-50 p-3">
            <div className="font-medium text-blue-900">Store Entries</div>
            <div className="font-mono text-xl text-blue-600">{recentEntries.length}</div>
          </div>
          <div className="rounded border bg-green-50 p-3">
            <div className="font-medium text-green-900">Filtered Entries</div>
            <div className="font-mono text-xl text-green-600">{filteredEntries.length}</div>
          </div>
          <div className="rounded border bg-purple-50 p-3">
            <div className="font-medium text-purple-900">Streaming</div>
            <div className="font-mono text-xl text-purple-600">{isStreaming ? 'Yes' : 'No'}</div>
          </div>
          <div className="rounded border bg-orange-50 p-3">
            <div className="font-medium text-orange-900">Invariant Enabled</div>
            <div className="font-mono text-xl text-orange-600">
              {TranscriptCountInvariant.isInvariantCheckingEnabled() ? 'Yes' : 'No'}
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            onClick={runTests}
            disabled={isRunning}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isRunning ? 'Running Tests...' : 'Run Invariant Tests'}
          </button>
          <button
            onClick={clearMismatches}
            className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
          >
            Clear Results
          </button>
        </div>
      </div>

      {/* Test Results */}
      {Object.keys(testResults).length > 0 && (
        <div className="rounded border bg-white p-4">
          <h4 className="text-md mb-3 font-semibold text-gray-900">Test Results</h4>
          <div className="space-y-2">
            {testScenarios.map(scenario => {
              const result = testResults[scenario.id]
              if (!result) return null

              return (
                <div
                  key={scenario.id}
                  className={`rounded border p-3 ${
                    result.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div
                        className={`font-medium ${
                          result.passed ? 'text-green-900' : 'text-red-900'
                        }`}
                      >
                        {result.passed ? '✅' : '❌'} {scenario.name}
                      </div>
                      <div className="text-sm text-gray-600">{scenario.description}</div>
                    </div>
                    <div className="font-mono text-sm">
                      {result.result ? (
                        <div className="text-right">
                          <div>UI: {result.result.uiCount}</div>
                          <div>Store: {result.result.storeCount}</div>
                        </div>
                      ) : (
                        <div className="text-green-600">Match</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mismatch Statistics */}
      <div className="rounded border bg-white p-4">
        <h4 className="text-md mb-3 font-semibold text-gray-900">Mismatch Statistics</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded bg-gray-50 p-3">
            <div className="font-medium text-gray-900">Total Mismatches</div>
            <div className="font-mono text-xl text-gray-600">{stats.total}</div>
          </div>
          <div className="rounded bg-gray-50 p-3">
            <div className="font-medium text-gray-900">Recent Mismatches</div>
            <div className="font-mono text-xl text-gray-600">{stats.recent.length}</div>
          </div>
          <div className="rounded bg-gray-50 p-3">
            <div className="font-medium text-gray-900">Hook Mismatch</div>
            <div className="font-mono text-xl text-gray-600">{mismatchFromHook ? 'Yes' : 'No'}</div>
          </div>
        </div>

        {stats.total > 0 && (
          <div className="mt-4">
            <div className="mb-2 font-medium text-gray-900">By Component:</div>
            <div className="space-y-1 text-sm">
              {Object.entries(stats.byComponent).map(([component, count]) => (
                <div key={component} className="flex justify-between">
                  <span className="font-mono text-gray-600">{component}</span>
                  <span className="font-mono text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Mismatches Detail */}
      {stats.recent.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h4 className="text-md mb-3 font-semibold text-gray-900">Recent Mismatches</h4>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {stats.recent.map((mismatch, index) => (
              <div key={index} className="rounded border border-red-200 bg-red-50 p-2 text-sm">
                <div className="font-medium text-red-900">
                  {mismatch.componentName} - {new Date(mismatch.timestamp).toLocaleTimeString()}
                </div>
                <div className="text-red-700">
                  UI: {mismatch.uiCount}, Store: {mismatch.storeCount}, Filtered:{' '}
                  {mismatch.storeFilteredCount}
                </div>
                {mismatch.additionalInfo && (
                  <div className="mt-1 text-red-600">
                    {JSON.stringify(mismatch.additionalInfo, null, 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

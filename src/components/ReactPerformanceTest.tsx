/**
 * React Performance Testing Suite
 * Comprehensive testing framework for React rendering performance
 */

import React, {Component, useState, useEffect, useRef, memo} from 'react'
import {render, unmountComponentAtNode} from 'react-dom'
import {useTranscriptStore} from '../state/transcript-state'
import {OptimizedTranscriptDisplay} from '../components/OptimizedTranscriptDisplay'
import {useRenderOptimization, useOptimizedState} from '../hooks/useReactOptimization'
import {TaskPriority, usePerformanceScheduler} from '../utils/react-performance-scheduler'

// Performance test configuration
interface PerformanceTestConfig {
  name: string
  component: React.ComponentType<any>
  props: any
  iterations: number
  measureMemory: boolean
  measureRenderTime: boolean
}

// Performance test results
interface PerformanceTestResult {
  testName: string
  totalRenderTime: number
  averageRenderTime: number
  minRenderTime: number
  maxRenderTime: number
  memoryUsage?: {
    before: number
    after: number
    peak: number
  }
  fps: number
  iterations: number
}

// Performance testing class
class ReactPerformanceTester {
  private container: HTMLDivElement
  private results: PerformanceTestResult[] = []

  constructor() {
    this.container = document.createElement('div')
    this.container.style.position = 'absolute'
    this.container.style.top = '-9999px'
    this.container.style.left = '-9999px'
    document.body.appendChild(this.container)
  }

  // Run a single performance test
  async runTest(config: PerformanceTestConfig): Promise<PerformanceTestResult> {
    const renderTimes: number[] = []
    let memoryBefore = 0
    let memoryAfter = 0
    let memoryPeak = 0

    // Measure initial memory
    if (config.measureMemory && 'memory' in performance) {
      memoryBefore = (performance as any).memory.usedJSHeapSize
    }

    // Run test iterations
    for (let i = 0; i < config.iterations; i++) {
      const startTime = performance.now()

      // Render component
      render(React.createElement(config.component, config.props), this.container)

      // Force layout
      this.container.offsetHeight

      const endTime = performance.now()
      renderTimes.push(endTime - startTime)

      // Track peak memory
      if (config.measureMemory && 'memory' in performance) {
        const currentMemory = (performance as any).memory.usedJSHeapSize
        memoryPeak = Math.max(memoryPeak, currentMemory)
      }

      // Cleanup
      unmountComponentAtNode(this.container)

      // Allow browser to breathe
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1))
      }
    }

    // Measure final memory
    if (config.measureMemory && 'memory' in performance) {
      memoryAfter = (performance as any).memory.usedJSHeapSize
    }

    // Calculate results
    const totalRenderTime = renderTimes.reduce((sum, time) => sum + time, 0)
    const averageRenderTime = totalRenderTime / config.iterations
    const minRenderTime = Math.min(...renderTimes)
    const maxRenderTime = Math.max(...renderTimes)
    const fps = 1000 / averageRenderTime

    const result: PerformanceTestResult = {
      testName: config.name,
      totalRenderTime,
      averageRenderTime,
      minRenderTime,
      maxRenderTime,
      fps,
      iterations: config.iterations,
      ...(config.measureMemory && {
        memoryUsage: {
          before: memoryBefore,
          after: memoryAfter,
          peak: memoryPeak
        }
      })
    }

    this.results.push(result)
    return result
  }

  // Run multiple tests
  async runTests(configs: PerformanceTestConfig[]): Promise<PerformanceTestResult[]> {
    const results: PerformanceTestResult[] = []

    for (const config of configs) {
      console.log(`Running test: ${config.name}...`)
      const result = await this.runTest(config)
      results.push(result)
      console.log(`Completed: ${config.name} - Avg: ${result.averageRenderTime.toFixed(2)}ms`)
    }

    return results
  }

  // Generate performance report
  generateReport(): string {
    let report = '\n=== React Performance Test Report ===\n\n'

    this.results.forEach(result => {
      report += `Test: ${result.testName}\n`
      report += `  Iterations: ${result.iterations}\n`
      report += `  Average Render Time: ${result.averageRenderTime.toFixed(2)}ms\n`
      report += `  Min/Max Render Time: ${result.minRenderTime.toFixed(2)}ms / ${result.maxRenderTime.toFixed(2)}ms\n`
      report += `  Estimated FPS: ${result.fps.toFixed(1)}\n`

      if (result.memoryUsage) {
        const memoryDiff = result.memoryUsage.after - result.memoryUsage.before
        report += `  Memory Usage: ${(memoryDiff / 1024 / 1024).toFixed(2)}MB change\n`
        report += `  Peak Memory: ${(result.memoryUsage.peak / 1024 / 1024).toFixed(2)}MB\n`
      }

      report += '\n'
    })

    return report
  }

  // Cleanup
  destroy() {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }
  }
}

// Test components
const UnoptimizedComponent: React.FC<{items: string[]}> = ({items}) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(prev => prev + 1)
  }, [items])

  return (
    <div>
      <h3>Unoptimized Component (Render #{count})</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>
            <span>{item}</span>
            <button onClick={() => console.log(item)}>Click</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const OptimizedComponent = memo<{items: string[]}>(
  ({items}) => {
    const [count, setOptimizedCount] = useOptimizedState(0)
    const {renderCount} = useRenderOptimization('OptimizedComponent')

    useEffect(() => {
      setOptimizedCount(prev => prev + 1)
    }, [items, setOptimizedCount])

    const handleClick = React.useCallback((item: string) => {
      console.log(item)
    }, [])

    const renderedItems = React.useMemo(
      () =>
        items.map((item, index) => (
          <li key={item}>
            <span>{item}</span>
            <button onClick={() => handleClick(item)}>Click</button>
          </li>
        )),
      [items, handleClick]
    )

    return (
      <div>
        <h3>Optimized Component (Render #{renderCount})</h3>
        <ul>{renderedItems}</ul>
      </div>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.items.length === nextProps.items.length &&
      prevProps.items.every((item, index) => item === nextProps.items[index])
    )
  }
)

OptimizedComponent.displayName = 'OptimizedComponent'

// Heavy rendering component for stress testing
const HeavyComponent: React.FC<{complexity: number}> = ({complexity}) => {
  const items = Array.from({length: complexity}, (_, i) => `Item ${i}`)

  // Simulate heavy computation
  const heavyComputation = React.useMemo(() => {
    let result = 0
    for (let i = 0; i < complexity * 1000; i++) {
      result += Math.random()
    }
    return result
  }, [complexity])

  return (
    <div>
      <h3>Heavy Component (Complexity: {complexity})</h3>
      <p>Computation Result: {heavyComputation.toFixed(2)}</p>
      <div>
        {items.map(item => (
          <div key={item} style={{padding: '2px', border: '1px solid #ccc'}}>
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

// Transcript performance test component
const TranscriptPerformanceTest: React.FC = () => {
  const {schedule} = usePerformanceScheduler()
  const [testResults, setTestResults] = useState<PerformanceTestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const runPerformanceTests = React.useCallback(async () => {
    setIsRunning(true)
    const tester = new ReactPerformanceTester()

    try {
      // Generate test data
      const smallDataset = Array.from({length: 50}, (_, i) => `Entry ${i}`)
      const mediumDataset = Array.from({length: 200}, (_, i) => `Entry ${i}`)
      const largeDataset = Array.from({length: 1000}, (_, i) => `Entry ${i}`)

      const testConfigs: PerformanceTestConfig[] = [
        {
          name: 'Small Dataset - Unoptimized',
          component: UnoptimizedComponent,
          props: {items: smallDataset},
          iterations: 100,
          measureMemory: true,
          measureRenderTime: true
        },
        {
          name: 'Small Dataset - Optimized',
          component: OptimizedComponent,
          props: {items: smallDataset},
          iterations: 100,
          measureMemory: true,
          measureRenderTime: true
        },
        {
          name: 'Medium Dataset - Unoptimized',
          component: UnoptimizedComponent,
          props: {items: mediumDataset},
          iterations: 50,
          measureMemory: true,
          measureRenderTime: true
        },
        {
          name: 'Medium Dataset - Optimized',
          component: OptimizedComponent,
          props: {items: mediumDataset},
          iterations: 50,
          measureMemory: true,
          measureRenderTime: true
        },
        {
          name: 'Large Dataset - Optimized Only',
          component: OptimizedComponent,
          props: {items: largeDataset},
          iterations: 20,
          measureMemory: true,
          measureRenderTime: true
        },
        {
          name: 'Heavy Computation - Low Complexity',
          component: HeavyComponent,
          props: {complexity: 10},
          iterations: 20,
          measureMemory: true,
          measureRenderTime: true
        },
        {
          name: 'Heavy Computation - High Complexity',
          component: HeavyComponent,
          props: {complexity: 50},
          iterations: 10,
          measureMemory: true,
          measureRenderTime: true
        }
      ]

      const results = await tester.runTests(testConfigs)
      setTestResults(results)

      // Generate and log report
      const report = tester.generateReport()
      console.log(report)
    } catch (error) {
      console.error('Performance test failed:', error)
    } finally {
      tester.destroy()
      setIsRunning(false)
    }
  }, [])

  const startTests = React.useCallback(() => {
    schedule(runPerformanceTests, TaskPriority.LOW)
  }, [schedule, runPerformanceTests])

  return (
    <div className="performance-test-suite rounded-lg bg-gray-50 p-6">
      <h2 className="mb-4 text-2xl font-bold">React Performance Test Suite</h2>

      <button
        onClick={startTests}
        disabled={isRunning}
        className={`rounded px-4 py-2 ${
          isRunning ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {isRunning ? 'Running Tests...' : 'Run Performance Tests'}
      </button>

      {testResults.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-xl font-semibold">Test Results</h3>
          <div className="grid gap-4">
            {testResults.map((result, index) => (
              <div key={index} className="rounded border bg-white p-4">
                <h4 className="font-semibold">{result.testName}</h4>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div>
                    <span className="text-gray-600">Avg Time:</span>
                    <span className="ml-1 font-medium">
                      {result.averageRenderTime.toFixed(2)}ms
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">FPS:</span>
                    <span className="ml-1 font-medium">{result.fps.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Min/Max:</span>
                    <span className="ml-1 font-medium">
                      {result.minRenderTime.toFixed(1)}/{result.maxRenderTime.toFixed(1)}ms
                    </span>
                  </div>
                  {result.memoryUsage && (
                    <div>
                      <span className="text-gray-600">Memory:</span>
                      <span className="ml-1 font-medium">
                        {(
                          (result.memoryUsage.after - result.memoryUsage.before) /
                          1024 /
                          1024
                        ).toFixed(1)}
                        MB
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Export the performance testing components
export {
  ReactPerformanceTester,
  TranscriptPerformanceTest,
  UnoptimizedComponent,
  OptimizedComponent,
  HeavyComponent
}

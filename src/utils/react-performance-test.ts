/**
 * React Performance Testing Suite
 * Comprehensive testing and benchmarking for React component performance
 */

import {useState, useEffect, useRef, ComponentType, createElement} from 'react'
import {render} from '@testing-library/react'
import {performanceScheduler} from '../utils/react-performance-scheduler'

// Performance metrics interface
interface PerformanceMetrics {
  renderTime: number
  mountTime: number
  updateTime: number
  unmountTime: number
  memoryUsage: {
    before: number
    after: number
    peak: number
  }
  rerenderCount: number
  effectExecutions: number
  schedulerStats: Record<string, number>
}

// Test scenario interface
interface TestScenario {
  name: string
  component: ComponentType<any>
  props?: any
  iterations: number
  warmupIterations?: number
  updateProps?: any[]
}

// Performance test result
interface TestResult {
  scenario: string
  metrics: PerformanceMetrics
  averages: {
    renderTime: number
    updateTime: number
    memoryDelta: number
  }
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  recommendations: string[]
}

// React Performance Benchmark class
export class ReactPerformanceBenchmark {
  private results: TestResult[] = []
  private isRunning = false

  // Run a single performance test
  async runTest(scenario: TestScenario): Promise<TestResult> {
    console.log(`Running performance test: ${scenario.name}`)

    const metrics: PerformanceMetrics = {
      renderTime: 0,
      mountTime: 0,
      updateTime: 0,
      unmountTime: 0,
      memoryUsage: {before: 0, after: 0, peak: 0},
      rerenderCount: 0,
      effectExecutions: 0,
      schedulerStats: {}
    }

    const renderTimes: number[] = []
    const updateTimes: number[] = []
    const memoryDeltas: number[] = []

    // Warmup iterations
    const warmupCount = scenario.warmupIterations || Math.floor(scenario.iterations * 0.1)
    for (let i = 0; i < warmupCount; i++) {
      await this.runSingleIteration(scenario, metrics, false)
    }

    // Actual test iterations
    for (let i = 0; i < scenario.iterations; i++) {
      const iterationMetrics = await this.runSingleIteration(scenario, metrics, true)
      renderTimes.push(iterationMetrics.renderTime)
      updateTimes.push(iterationMetrics.updateTime)
      memoryDeltas.push(iterationMetrics.memoryUsage.after - iterationMetrics.memoryUsage.before)
    }

    // Calculate averages
    const averages = {
      renderTime: renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length,
      updateTime: updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length,
      memoryDelta: memoryDeltas.reduce((a, b) => a + b, 0) / memoryDeltas.length
    }

    // Get scheduler statistics
    metrics.schedulerStats = performanceScheduler.getStats()

    // Generate grade and recommendations
    const grade = this.calculateGrade(averages)
    const recommendations = this.generateRecommendations(averages, metrics)

    const result: TestResult = {
      scenario: scenario.name,
      metrics,
      averages,
      grade,
      recommendations
    }

    this.results.push(result)
    return result
  }

  // Run a single test iteration
  private async runSingleIteration(
    scenario: TestScenario,
    metrics: PerformanceMetrics,
    recordMetrics: boolean
  ): Promise<PerformanceMetrics> {
    const iterationMetrics: PerformanceMetrics = {
      renderTime: 0,
      mountTime: 0,
      updateTime: 0,
      unmountTime: 0,
      memoryUsage: {before: 0, after: 0, peak: 0},
      rerenderCount: 0,
      effectExecutions: 0,
      schedulerStats: {}
    }

    // Measure memory before
    const memoryBefore = this.getMemoryUsage()
    iterationMetrics.memoryUsage.before = memoryBefore

    // Mount component
    const mountStart = performance.now()
    const TestComponent = this.createInstrumentedComponent(scenario.component, iterationMetrics)

    const {rerender, unmount: unmountFn} = render(
      createElement(TestComponent, scenario.props || {})
    )
    const mountEnd = performance.now()
    iterationMetrics.mountTime = mountEnd - mountStart

    // Wait for initial effects to complete
    await this.waitForEffects(50)

    const renderEnd = performance.now()
    iterationMetrics.renderTime = renderEnd - mountStart

    // Test updates if provided
    if (scenario.updateProps && scenario.updateProps.length > 0) {
      const updateStart = performance.now()

      for (const updateProps of scenario.updateProps) {
        rerender(createElement(TestComponent, updateProps))
        await this.waitForEffects(16) // Wait for one frame
      }

      const updateEnd = performance.now()
      iterationMetrics.updateTime = updateEnd - updateStart
    }

    // Unmount component
    const unmountStart = performance.now()
    unmountFn()
    const unmountEnd = performance.now()
    iterationMetrics.unmountTime = unmountEnd - unmountStart

    // Measure memory after
    await this.waitForGarbageCollection()
    const memoryAfter = this.getMemoryUsage()
    iterationMetrics.memoryUsage.after = memoryAfter
    iterationMetrics.memoryUsage.peak = Math.max(memoryBefore, memoryAfter)

    // Update cumulative metrics
    if (recordMetrics) {
      metrics.renderTime += iterationMetrics.renderTime
      metrics.mountTime += iterationMetrics.mountTime
      metrics.updateTime += iterationMetrics.updateTime
      metrics.unmountTime += iterationMetrics.unmountTime
      metrics.rerenderCount += iterationMetrics.rerenderCount
      metrics.effectExecutions += iterationMetrics.effectExecutions

      metrics.memoryUsage.before += iterationMetrics.memoryUsage.before
      metrics.memoryUsage.after += iterationMetrics.memoryUsage.after
      metrics.memoryUsage.peak = Math.max(
        metrics.memoryUsage.peak,
        iterationMetrics.memoryUsage.peak
      )
    }

    return iterationMetrics
  }

  // Create instrumented component for monitoring
  private createInstrumentedComponent(Component: ComponentType<any>, metrics: PerformanceMetrics) {
    return (props: any) => {
      const renderCount = useRef(0)
      const {getStats} = usePerformanceMonitor('TestComponent')

      // Track re-renders
      useEffect(() => {
        renderCount.current++
        metrics.rerenderCount = renderCount.current
      })

      // Track effect executions
      useEffect(() => {
        metrics.effectExecutions++
      })

      return createElement(Component, props)
    }
  }

  // Calculate performance grade
  private calculateGrade(averages: {
    renderTime: number
    updateTime: number
    memoryDelta: number
  }): 'A' | 'B' | 'C' | 'D' | 'F' {
    let score = 100

    // Penalize slow render times
    if (averages.renderTime > 16) score -= 20 // Missing 60fps
    if (averages.renderTime > 33) score -= 20 // Missing 30fps
    if (averages.renderTime > 50) score -= 20 // Really slow

    // Penalize slow updates
    if (averages.updateTime > 16) score -= 15
    if (averages.updateTime > 33) score -= 15

    // Penalize memory leaks
    if (averages.memoryDelta > 1024 * 1024) score -= 15 // 1MB leak
    if (averages.memoryDelta > 5 * 1024 * 1024) score -= 15 // 5MB leak

    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  // Generate performance recommendations
  private generateRecommendations(
    averages: {renderTime: number; updateTime: number; memoryDelta: number},
    metrics: PerformanceMetrics
  ): string[] {
    const recommendations: string[] = []

    if (averages.renderTime > 16) {
      recommendations.push('Consider using React.memo to prevent unnecessary re-renders')
      recommendations.push('Use useMemo for expensive calculations')
      recommendations.push('Implement virtualization for large lists')
    }

    if (averages.updateTime > 16) {
      recommendations.push('Use useCallback to stabilize function references')
      recommendations.push('Consider batching state updates')
      recommendations.push('Implement custom scheduling for non-critical updates')
    }

    if (metrics.rerenderCount > metrics.effectExecutions * 2) {
      recommendations.push('Reduce unnecessary re-renders by optimizing component structure')
      recommendations.push('Split large components into smaller, focused components')
    }

    if (averages.memoryDelta > 1024 * 1024) {
      recommendations.push('Check for memory leaks in event listeners and subscriptions')
      recommendations.push('Ensure proper cleanup in useEffect hooks')
      recommendations.push('Consider using WeakMap/WeakSet for caching')
    }

    const totalScheduledTasks = Object.values(metrics.schedulerStats).reduce(
      (sum, count) => sum + count,
      0
    )

    if (totalScheduledTasks > 100) {
      recommendations.push('Optimize task scheduling - too many scheduled tasks detected')
      recommendations.push('Consider consolidating or batching scheduled operations')
    }

    return recommendations
  }

  // Utility methods
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize
    }
    return 0
  }

  private async waitForEffects(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async waitForGarbageCollection(): Promise<void> {
    // Force garbage collection if available (Chrome DevTools)
    if ('gc' in window) {
      ;(window as any).gc()
    }

    // Wait a bit for GC to complete
    await this.waitForEffects(100)
  }

  // Run multiple test scenarios
  async runBenchmark(scenarios: TestScenario[]): Promise<TestResult[]> {
    if (this.isRunning) {
      throw new Error('Benchmark is already running')
    }

    this.isRunning = true
    this.results = []

    try {
      for (const scenario of scenarios) {
        await this.runTest(scenario)

        // Clean up between tests
        await this.waitForGarbageCollection()
        performanceScheduler.clear()
      }

      return this.results
    } finally {
      this.isRunning = false
    }
  }

  // Generate comprehensive report
  generateReport(): string {
    if (this.results.length === 0) {
      return 'No test results available'
    }

    let report = '\n=== React Performance Benchmark Report ===\n\n'

    // Summary
    const averageGrade = this.calculateAverageGrade()
    report += `Overall Performance Grade: ${averageGrade}\n`
    report += `Total Tests Run: ${this.results.length}\n`
    report += `Date: ${new Date().toISOString()}\n\n`

    // Individual test results
    this.results.forEach(result => {
      report += `--- ${result.scenario} ---\n`
      report += `Grade: ${result.grade}\n`
      report += `Average Render Time: ${result.averages.renderTime.toFixed(2)}ms\n`
      report += `Average Update Time: ${result.averages.updateTime.toFixed(2)}ms\n`
      report += `Memory Delta: ${(result.averages.memoryDelta / 1024).toFixed(2)}KB\n`
      report += `Re-render Count: ${result.metrics.rerenderCount}\n`

      if (result.recommendations.length > 0) {
        report += '\nRecommendations:\n'
        result.recommendations.forEach(rec => {
          report += `  - ${rec}\n`
        })
      }

      report += '\n'
    })

    // Performance summary
    const fastestTest = this.results.reduce((fastest, current) =>
      current.averages.renderTime < fastest.averages.renderTime ? current : fastest
    )

    const slowestTest = this.results.reduce((slowest, current) =>
      current.averages.renderTime > slowest.averages.renderTime ? current : slowest
    )

    report += `Fastest Component: ${fastestTest.scenario} (${fastestTest.averages.renderTime.toFixed(2)}ms)\n`
    report += `Slowest Component: ${slowestTest.scenario} (${slowestTest.averages.renderTime.toFixed(2)}ms)\n`

    return report
  }

  private calculateAverageGrade(): string {
    const gradeValues = {A: 95, B: 85, C: 75, D: 65, F: 50}
    const averageScore =
      this.results.reduce((sum, result) => sum + gradeValues[result.grade], 0) / this.results.length

    if (averageScore >= 90) return 'A'
    if (averageScore >= 80) return 'B'
    if (averageScore >= 70) return 'C'
    if (averageScore >= 60) return 'D'
    return 'F'
  }

  // Export results as JSON
  exportResults(): string {
    return JSON.stringify(this.results, null, 2)
  }

  // Clear all results
  clearResults(): void {
    this.results = []
  }
}

// Performance test runner hook
export const usePerformanceTest = () => {
  const [benchmark] = useState(() => new ReactPerformanceBenchmark())
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])

  const runTests = async (scenarios: TestScenario[]) => {
    setIsRunning(true)
    try {
      const testResults = await benchmark.runBenchmark(scenarios)
      setResults(testResults)
      return testResults
    } finally {
      setIsRunning(false)
    }
  }

  const clearResults = () => {
    benchmark.clearResults()
    setResults([])
  }

  return {
    runTests,
    clearResults,
    isRunning,
    results,
    generateReport: () => benchmark.generateReport(),
    exportResults: () => benchmark.exportResults()
  }
}

// Create default test scenarios for common component patterns
export const createDefaultTestScenarios = (): TestScenario[] => [
  {
    name: 'Simple Functional Component',
    component: ({text}: {text: string}) => createElement('div', {}, text),
    props: {text: 'Hello World'},
    iterations: 100,
    updateProps: [{text: 'Updated Text 1'}, {text: 'Updated Text 2'}, {text: 'Updated Text 3'}]
  },
  {
    name: 'Component with useState',
    component: () => {
      const [count, setCount] = useState(0)
      return createElement(
        'div',
        {},
        createElement('span', {}, count.toString()),
        createElement('button', {onClick: () => setCount(c => c + 1)}, 'Increment')
      )
    },
    props: {},
    iterations: 100
  },
  {
    name: 'Component with useEffect',
    component: ({data}: {data: string}) => {
      const [processedData, setProcessedData] = useState('')

      useEffect(() => {
        // Simulate data processing
        const processed = data.toUpperCase()
        setProcessedData(processed)
      }, [data])

      return createElement('div', {}, processedData)
    },
    props: {data: 'test data'},
    iterations: 100,
    updateProps: [{data: 'updated data 1'}, {data: 'updated data 2'}, {data: 'updated data 3'}]
  }
]

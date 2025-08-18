/**
 * React Performance Scheduler
 * Custom scheduling system for optimized rendering performance
 */

import {useCallback, useEffect, useRef, useState} from 'react'

// Priority levels for task scheduling
export enum TaskPriority {
  IMMEDIATE = 0, // Critical updates (e.g., user input response)
  HIGH = 1, // Important updates (e.g., new transcript entries)
  NORMAL = 2, // Regular updates (e.g., UI state changes)
  LOW = 3, // Background updates (e.g., metrics, cleanup)
  IDLE = 4 // Idle-time tasks (e.g., precomputing, optimization)
}

// Task interface
interface ScheduledTask {
  id: string
  callback: () => void
  priority: TaskPriority
  timestamp: number
  timeout?: number
}

// Performance scheduler class
class ReactPerformanceScheduler {
  private tasks: Map<TaskPriority, ScheduledTask[]> = new Map()
  private isRunning = false
  private frameId: number | null = null
  private idleId: number | null = null

  constructor() {
    // Initialize priority queues
    Object.values(TaskPriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.tasks.set(priority, [])
      }
    })
  }

  // Schedule a task with priority
  schedule(
    callback: () => void,
    priority: TaskPriority = TaskPriority.NORMAL,
    timeout?: number
  ): string {
    const task: ScheduledTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      callback,
      priority,
      timestamp: performance.now(),
      timeout
    }

    const priorityQueue = this.tasks.get(priority)
    if (priorityQueue) {
      priorityQueue.push(task)
      this.startScheduler()
    }

    return task.id
  }

  // Cancel a scheduled task
  cancel(taskId: string): boolean {
    for (const [priority, queue] of this.tasks) {
      const taskIndex = queue.findIndex(task => task.id === taskId)
      if (taskIndex !== -1) {
        queue.splice(taskIndex, 1)
        return true
      }
    }
    return false
  }

  // Start the scheduler
  private startScheduler() {
    if (this.isRunning) return

    this.isRunning = true
    this.scheduleNextFrame()
  }

  // Schedule next animation frame
  private scheduleNextFrame() {
    this.frameId = requestAnimationFrame(timestamp => {
      this.processHighPriorityTasks(timestamp)

      // Schedule idle callback for lower priority tasks
      if (window.requestIdleCallback) {
        this.idleId = window.requestIdleCallback(
          deadline => {
            this.processIdleTasks(deadline)
          },
          {timeout: 5000}
        )
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          this.processIdleTasks({
            timeRemaining: () => 5,
            didTimeout: false
          } as IdleDeadline)
        }, 0)
      }
    })
  }

  // Process high priority tasks during frame time
  private processHighPriorityTasks(timestamp: number) {
    const frameBudget = 16.67 // ~60fps budget
    const startTime = performance.now()

    // Process IMMEDIATE and HIGH priority tasks
    for (const priority of [TaskPriority.IMMEDIATE, TaskPriority.HIGH]) {
      const queue = this.tasks.get(priority)
      if (!queue) continue

      while (queue.length > 0 && performance.now() - startTime < frameBudget) {
        const task = queue.shift()
        if (task) {
          try {
            task.callback()
          } catch (error) {
            console.error('Error executing scheduled task:', error)
          }
        }
      }
    }

    // Continue scheduling if there are more tasks
    if (this.hasRemainingTasks()) {
      this.scheduleNextFrame()
    } else {
      this.isRunning = false
    }
  }

  // Process lower priority tasks during idle time
  private processIdleTasks(deadline: IdleDeadline) {
    // Process NORMAL, LOW, and IDLE priority tasks
    for (const priority of [TaskPriority.NORMAL, TaskPriority.LOW, TaskPriority.IDLE]) {
      const queue = this.tasks.get(priority)
      if (!queue) continue

      while (queue.length > 0 && deadline.timeRemaining() > 1) {
        const task = queue.shift()
        if (task) {
          // Check for timeout
          if (task.timeout && performance.now() - task.timestamp > task.timeout) {
            continue // Skip expired task
          }

          try {
            task.callback()
          } catch (error) {
            console.error('Error executing idle task:', error)
          }
        }
      }

      // Break if we're running out of time
      if (deadline.timeRemaining() <= 1) break
    }

    // Continue processing if there are remaining tasks
    if (this.hasRemainingTasks()) {
      this.scheduleNextFrame()
    } else {
      this.isRunning = false
    }
  }

  // Check if there are remaining tasks
  private hasRemainingTasks(): boolean {
    return Array.from(this.tasks.values()).some(queue => queue.length > 0)
  }

  // Get scheduler statistics
  getStats() {
    const stats: Record<string, number> = {}
    for (const [priority, queue] of this.tasks) {
      stats[`priority_${priority}`] = queue.length
    }
    return stats
  }

  // Clear all tasks
  clear() {
    this.tasks.forEach(queue => (queue.length = 0))
    if (this.frameId) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }
    if (this.idleId && window.cancelIdleCallback) {
      window.cancelIdleCallback(this.idleId)
      this.idleId = null
    }
    this.isRunning = false
  }
}

// Global scheduler instance
const globalScheduler = new ReactPerformanceScheduler()

// Hook for using the performance scheduler
export const usePerformanceScheduler = () => {
  const schedule = useCallback(
    (callback: () => void, priority: TaskPriority = TaskPriority.NORMAL, timeout?: number) => {
      return globalScheduler.schedule(callback, priority, timeout)
    },
    []
  )

  const cancel = useCallback((taskId: string) => {
    return globalScheduler.cancel(taskId)
  }, [])

  const getStats = useCallback(() => {
    return globalScheduler.getStats()
  }, [])

  return {schedule, cancel, getStats}
}

// Hook for throttled updates using the scheduler
export const useThrottledUpdate = <T>(
  value: T,
  delay: number = 16.67, // ~60fps
  priority: TaskPriority = TaskPriority.NORMAL
): T => {
  const [throttledValue, setThrottledValue] = useState(value)
  const lastUpdateTime = useRef(0)
  const taskId = useRef<string | null>(null)
  const {schedule, cancel} = usePerformanceScheduler()

  useEffect(() => {
    const now = performance.now()
    const timeSinceLastUpdate = now - lastUpdateTime.current

    // Cancel previous task if exists
    if (taskId.current) {
      cancel(taskId.current)
    }

    if (timeSinceLastUpdate >= delay) {
      // Update immediately if enough time has passed
      setThrottledValue(value)
      lastUpdateTime.current = now
    } else {
      // Schedule update for later
      taskId.current = schedule(() => {
        setThrottledValue(value)
        lastUpdateTime.current = performance.now()
        taskId.current = null
      }, priority)
    }

    return () => {
      if (taskId.current) {
        cancel(taskId.current)
        taskId.current = null
      }
    }
  }, [value, delay, priority, schedule, cancel])

  return throttledValue
}

// Hook for debounced updates using the scheduler
export const useDebouncedUpdate = <T>(
  value: T,
  delay: number = 300,
  priority: TaskPriority = TaskPriority.NORMAL
): T => {
  const [debouncedValue, setDebouncedValue] = useState(value)
  const taskId = useRef<string | null>(null)
  const {schedule, cancel} = usePerformanceScheduler()

  useEffect(() => {
    // Cancel previous task
    if (taskId.current) {
      cancel(taskId.current)
    }

    // Schedule new update
    taskId.current = schedule(
      () => {
        setDebouncedValue(value)
        taskId.current = null
      },
      priority,
      delay
    )

    return () => {
      if (taskId.current) {
        cancel(taskId.current)
        taskId.current = null
      }
    }
  }, [value, delay, priority, schedule, cancel])

  return debouncedValue
}

// Hook for batched state updates
export const useBatchedUpdates = <T>(
  initialState: T,
  batchDelay: number = 16.67 // ~60fps
) => {
  const [state, setState] = useState(initialState)
  const pendingUpdates = useRef<Array<(prev: T) => T>>([])
  const taskId = useRef<string | null>(null)
  const {schedule, cancel} = usePerformanceScheduler()

  const batchedSetState = useCallback(
    (update: T | ((prev: T) => T), priority: TaskPriority = TaskPriority.NORMAL) => {
      const updateFn = typeof update === 'function' ? (update as (prev: T) => T) : () => update

      pendingUpdates.current.push(updateFn)

      // Cancel previous batch task
      if (taskId.current) {
        cancel(taskId.current)
      }

      // Schedule batched update
      taskId.current = schedule(() => {
        setState(prevState => {
          let newState = prevState
          for (const updateFn of pendingUpdates.current) {
            newState = updateFn(newState)
          }
          pendingUpdates.current = []
          return newState
        })
        taskId.current = null
      }, priority)
    },
    [schedule, cancel]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (taskId.current) {
        cancel(taskId.current)
      }
    }
  }, [cancel])

  return [state, batchedSetState] as const
}

// Hook for performance monitoring
export const usePerformanceMonitor = (componentName: string) => {
  const renderCount = useRef(0)
  const renderTimes = useRef<number[]>([])
  const lastRenderStart = useRef(0)
  const {schedule} = usePerformanceScheduler()

  // Track render start
  useEffect(() => {
    lastRenderStart.current = performance.now()
  })

  // Track render end
  useEffect(() => {
    const renderEnd = performance.now()
    const renderTime = renderEnd - lastRenderStart.current

    renderCount.current++
    renderTimes.current.push(renderTime)

    // Keep only last 100 render times
    if (renderTimes.current.length > 100) {
      renderTimes.current.shift()
    }

    // Log performance data periodically (low priority)
    if (renderCount.current % 50 === 0) {
      schedule(() => {
        const avgRenderTime =
          renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length
        const maxRenderTime = Math.max(...renderTimes.current)

        console.log(`[${componentName}] Performance Stats:`, {
          totalRenders: renderCount.current,
          avgRenderTime: avgRenderTime.toFixed(2) + 'ms',
          maxRenderTime: maxRenderTime.toFixed(2) + 'ms',
          recentRenderTime: renderTime.toFixed(2) + 'ms'
        })
      }, TaskPriority.LOW)
    }
  })

  const getStats = useCallback(() => {
    const avgRenderTime =
      renderTimes.current.length > 0
        ? renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length
        : 0

    return {
      totalRenders: renderCount.current,
      avgRenderTime,
      maxRenderTime: renderTimes.current.length > 0 ? Math.max(...renderTimes.current) : 0,
      recentRenderTimes: renderTimes.current.slice(-10)
    }
  }, [])

  return {getStats}
}

// Export the global scheduler for advanced usage
export {globalScheduler as performanceScheduler}

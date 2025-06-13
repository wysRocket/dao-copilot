// Performance monitoring utilities for multi-window architecture

export interface PerformanceMetrics {
  windowCount: number;
  memoryUsage: number;
  renderTime: number;
  ipcLatency: number;
  stateUpdates: number;
  timestamp: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private observers: ((metrics: PerformanceMetrics) => void)[] = [];
  private startTime = Date.now();

  private constructor() {
    this.setupPerformanceObserver();
    this.startMemoryMonitoring();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private setupPerformanceObserver() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            this.recordMetric('renderTime', entry.duration);
          }
        }
      });

      try {
        observer.observe({ entryTypes: ['navigation', 'measure'] });
      } catch (error) {
        console.warn('Performance observer not supported:', error);
      }
    }
  }

  private startMemoryMonitoring() {
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      if (typeof window !== 'undefined' && 'performance' in window) {
        const memory = (performance as any).memory;
        if (memory) {
          this.recordMetric('memoryUsage', memory.usedJSHeapSize);
        }
      }
    }, 30000);
  }

  public recordMetric(type: keyof PerformanceMetrics, value: number) {
    const currentMetrics = this.getCurrentMetrics();
    currentMetrics[type] = value;
    currentMetrics.timestamp = Date.now();
    
    // Keep only last 100 metrics
    if (this.metrics.length >= 100) {
      this.metrics.shift();
    }
    
    this.metrics.push({ ...currentMetrics });
    
    // Notify observers
    this.observers.forEach(observer => observer(currentMetrics));
  }

  public measureIpcLatency(startTime: number) {
    const latency = Date.now() - startTime;
    this.recordMetric('ipcLatency', latency);
    return latency;
  }

  public measureRender<T>(fn: () => T, name?: string): T {
    const startTime = performance.now();
    const result = fn();
    const endTime = performance.now();
    
    if (name) {
      performance.mark(`${name}-start`);
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
    }
    
    this.recordMetric('renderTime', endTime - startTime);
    return result;
  }

  public incrementStateUpdates() {
    const current = this.getCurrentMetrics();
    this.recordMetric('stateUpdates', current.stateUpdates + 1);
  }

  public updateWindowCount(count: number) {
    this.recordMetric('windowCount', count);
  }

  private getCurrentMetrics(): PerformanceMetrics {
    const latest = this.metrics[this.metrics.length - 1];
    return latest ? { ...latest } : {
      windowCount: 0,
      memoryUsage: 0,
      renderTime: 0,
      ipcLatency: 0,
      stateUpdates: 0,
      timestamp: Date.now(),
    };
  }

  public getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  public getAverageMetrics(duration = 60000): Partial<PerformanceMetrics> {
    const cutoff = Date.now() - duration;
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);
    
    if (recentMetrics.length === 0) return {};
    
    const averages = {
      memoryUsage: 0,
      renderTime: 0,
      ipcLatency: 0,
      stateUpdates: 0,
    };
    
    recentMetrics.forEach(metric => {
      averages.memoryUsage += metric.memoryUsage;
      averages.renderTime += metric.renderTime;
      averages.ipcLatency += metric.ipcLatency;
      averages.stateUpdates += metric.stateUpdates;
    });
    
    const count = recentMetrics.length;
    return {
      memoryUsage: averages.memoryUsage / count,
      renderTime: averages.renderTime / count,
      ipcLatency: averages.ipcLatency / count,
      stateUpdates: averages.stateUpdates / count,
    };
  }

  public subscribe(observer: (metrics: PerformanceMetrics) => void) {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  public reset() {
    this.metrics = [];
  }
}

// Memory management utilities
export class MemoryManager {
  private static cleanupTasks: (() => void)[] = [];
  private static cleanupInterval: NodeJS.Timeout | null = null;

  public static addCleanupTask(task: () => void) {
    this.cleanupTasks.push(task);
    
    // Start cleanup interval if not already running
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        this.runCleanup();
      }, 60000); // Every minute
    }
  }

  public static removeCleanupTask(task: () => void) {
    const index = this.cleanupTasks.indexOf(task);
    if (index > -1) {
      this.cleanupTasks.splice(index, 1);
    }
  }

  public static runCleanup() {
    this.cleanupTasks.forEach(task => {
      try {
        task();
      } catch (error) {
        console.warn('Cleanup task failed:', error);
      }
    });
    
    // Force garbage collection if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  }

  public static getMemoryUsage() {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const memory = (performance as any).memory;
      if (memory) {
        return {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
        };
      }
    }
    return null;
  }
}

// Debounce utility for performance optimization
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): T {
  let timeout: NodeJS.Timeout | null = null;
  
  return ((...args: any[]) => {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
    
    if (callNow) {
      func(...args);
    }
  }) as T;
}

// Throttle utility for performance optimization
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T {
  let inThrottle: boolean = false;
  
  return ((...args: any[]) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
}

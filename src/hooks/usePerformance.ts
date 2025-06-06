import { useEffect, useState, useCallback } from 'react';
import { PerformanceMonitor, PerformanceMetrics, MemoryManager } from '../utils/performance';
import { usePortalManager } from '../components/portals/PortalManager';
import { useSharedState } from './useSharedState';

export const usePerformance = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [averageMetrics, setAverageMetrics] = useState<Partial<PerformanceMetrics>>({});
  const portalManager = usePortalManager();
  const { broadcast } = useSharedState();

  const performanceMonitor = PerformanceMonitor.getInstance();

  // Subscribe to performance updates
  useEffect(() => {
    const unsubscribe = performanceMonitor.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });

    return unsubscribe;
  }, [performanceMonitor]);

  // Update average metrics every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const averages = performanceMonitor.getAverageMetrics();
      setAverageMetrics(averages);
    }, 10000);

    return () => clearInterval(interval);
  }, [performanceMonitor]);

  // Monitor window count changes
  useEffect(() => {
    performanceMonitor.updateWindowCount(portalManager.allWindows.length);
  }, [portalManager.allWindows.length, performanceMonitor]);

  // Performance measurement utilities
  const measureIpc = useCallback((startTime: number) => {
    return performanceMonitor.measureIpcLatency(startTime);
  }, [performanceMonitor]);

  const measureRender = useCallback(<T>(fn: () => T, name?: string): T => {
    return performanceMonitor.measureRender(fn, name);
  }, [performanceMonitor]);

  const trackStateUpdate = useCallback(() => {
    performanceMonitor.incrementStateUpdates();
  }, [performanceMonitor]);

  // Memory management
  const getMemoryUsage = useCallback(() => {
    return MemoryManager.getMemoryUsage();
  }, []);

  const runCleanup = useCallback(() => {
    MemoryManager.runCleanup();
    broadcast('memory-cleanup');
  }, [broadcast]);

  // Performance optimization suggestions
  const getOptimizationSuggestions = useCallback(() => {
    const suggestions: string[] = [];
    
    if (metrics) {
      if (metrics.memoryUsage > 50 * 1024 * 1024) { // 50MB
        suggestions.push('High memory usage detected. Consider closing unused windows.');
      }
      
      if (metrics.renderTime > 16) { // > 16ms (60fps threshold)
        suggestions.push('Slow rendering detected. Consider reducing window complexity.');
      }
      
      if (metrics.ipcLatency > 100) { // > 100ms
        suggestions.push('High IPC latency detected. Check system performance.');
      }
      
      if (metrics.windowCount > 5) {
        suggestions.push('Many windows open. Consider organizing your workspace.');
      }
    }
    
    return suggestions;
  }, [metrics]);

  // Performance report
  const generateReport = useCallback(() => {
    const allMetrics = performanceMonitor.getMetrics();
    const memoryUsage = getMemoryUsage();
    const suggestions = getOptimizationSuggestions();
    
    return {
      current: metrics,
      average: averageMetrics,
      history: allMetrics,
      memory: memoryUsage,
      suggestions,
      timestamp: Date.now(),
    };
  }, [metrics, averageMetrics, performanceMonitor, getMemoryUsage, getOptimizationSuggestions]);

  return {
    metrics,
    averageMetrics,
    measureIpc,
    measureRender,
    trackStateUpdate,
    getMemoryUsage,
    runCleanup,
    getOptimizationSuggestions,
    generateReport,
  };
};

// Hook for performance monitoring in specific components
export const useComponentPerformance = (componentName: string) => {
  const { measureRender, trackStateUpdate } = usePerformance();
  const [renderCount, setRenderCount] = useState(0);

  useEffect(() => {
    setRenderCount(prev => prev + 1);
    trackStateUpdate();
  });

  const measureComponentRender = useCallback(<T>(fn: () => T): T => {
    return measureRender(fn, `${componentName}-render`);
  }, [measureRender, componentName]);

  return {
    renderCount,
    measureRender: measureComponentRender,
  };
};
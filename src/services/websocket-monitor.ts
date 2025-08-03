type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface WebSocketConnectionMetrics {
  connectionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  state: 'connecting' | 'connected' | 'disconnected' | 'error' | 'timeout';
  errorCode?: number;
  errorReason?: string;
  apiKeyUsed: string;
  quotaStatus: 'ok' | 'warning' | 'exceeded' | 'unknown';
  messagesReceived: number;
  messagesSent: number;
  reconnectionAttempts: number;
  lastActivity: number;
}

export interface QuotaUsageMetrics {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  quotaExceededErrors: number;
  averageConnectionDuration: number;
  apiKeyUsage: Map<string, number>;
  hourlyUsage: Map<number, number>;
}

export class WebSocketMonitor {
  private static instance: WebSocketMonitor;
  private connections: Map<string, WebSocketConnectionMetrics> = new Map();
  private quotaMetrics: QuotaUsageMetrics = {
    totalConnections: 0,
    successfulConnections: 0,
    failedConnections: 0,
    quotaExceededErrors: 0,
    averageConnectionDuration: 0,
    apiKeyUsage: new Map(),
    hourlyUsage: new Map()
  };
  private logCallback?: (level: LogLevel, message: string, data?: unknown) => void;

  private constructor() {}

  public static getInstance(): WebSocketMonitor {
    if (!WebSocketMonitor.instance) {
      WebSocketMonitor.instance = new WebSocketMonitor();
    }
    return WebSocketMonitor.instance;
  }

  public setLogCallback(callback: (level: LogLevel, message: string, data?: unknown) => void): void {
    this.logCallback = callback;
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (this.logCallback) {
      this.logCallback(level, message, data);
    } else {
      console.log(`[WebSocketMonitor] ${level.toUpperCase()}: ${message}`, data || '');
    }
  }

  public startConnection(apiKey: string): string {
    const connectionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const metrics: WebSocketConnectionMetrics = {
      connectionId,
      startTime: Date.now(),
      state: 'connecting',
      apiKeyUsed: apiKey.substring(0, 10) + '...', // Only log partial key for security
      quotaStatus: 'unknown',
      messagesReceived: 0,
      messagesSent: 0,
      reconnectionAttempts: 0,
      lastActivity: Date.now()
    };

    this.connections.set(connectionId, metrics);
    this.quotaMetrics.totalConnections++;
    
    // Track API key usage
    const keyUsage = this.quotaMetrics.apiKeyUsage.get(metrics.apiKeyUsed) || 0;
    this.quotaMetrics.apiKeyUsage.set(metrics.apiKeyUsed, keyUsage + 1);

    // Track hourly usage
    const currentHour = new Date().getHours();
    const hourlyUsage = this.quotaMetrics.hourlyUsage.get(currentHour) || 0;
    this.quotaMetrics.hourlyUsage.set(currentHour, hourlyUsage + 1);

    this.log('info', 'WebSocket connection started', {
      connectionId,
      apiKey: metrics.apiKeyUsed,
      totalConnections: this.quotaMetrics.totalConnections
    });

    return connectionId;
  }

  public connectionEstablished(connectionId: string): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) {
      this.log('warn', 'Connection established for unknown connection ID', { connectionId });
      return;
    }

    metrics.state = 'connected';
    metrics.lastActivity = Date.now();
    this.quotaMetrics.successfulConnections++;

    this.log('info', 'WebSocket connection established', {
      connectionId,
      connectionTime: Date.now() - metrics.startTime,
      successRate: (this.quotaMetrics.successfulConnections / this.quotaMetrics.totalConnections * 100).toFixed(1) + '%'
    });
  }

  public connectionClosed(connectionId: string, code?: number, reason?: string): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) {
      this.log('warn', 'Connection closed for unknown connection ID', { connectionId, code, reason });
      return;
    }

    metrics.state = 'disconnected';
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.errorCode = code;
    metrics.errorReason = reason;

    // Detect quota issues
    if (code === 1011 || reason?.toLowerCase().includes('quota')) {
      metrics.quotaStatus = 'exceeded';
      this.quotaMetrics.quotaExceededErrors++;
      this.log('error', 'WebSocket connection closed due to quota exceeded', {
        connectionId,
        code,
        reason,
        duration: metrics.duration,
        quotaErrors: this.quotaMetrics.quotaExceededErrors
      });
    } else if (code && code !== 1000) {
      metrics.state = 'error';
      this.quotaMetrics.failedConnections++;
      this.log('error', 'WebSocket connection closed with error', {
        connectionId,
        code,
        reason,
        duration: metrics.duration
      });
    } else {
      this.log('info', 'WebSocket connection closed normally', {
        connectionId,
        duration: metrics.duration
      });
    }

    // Update average connection duration
    this.updateAverageConnectionDuration();
  }

  public connectionTimeout(connectionId: string): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) {
      this.log('warn', 'Connection timeout for unknown connection ID', { connectionId });
      return;
    }

    metrics.state = 'timeout';
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    this.quotaMetrics.failedConnections++;

    this.log('error', 'WebSocket connection timed out', {
      connectionId,
      duration: metrics.duration,
      timeoutAfter: metrics.duration
    });
  }

  public recordMessage(connectionId: string, direction: 'sent' | 'received', messageType?: string): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) {
      return;
    }

    if (direction === 'sent') {
      metrics.messagesSent++;
    } else {
      metrics.messagesReceived++;
    }

    metrics.lastActivity = Date.now();

    // Log significant message activity
    const totalMessages = metrics.messagesSent + metrics.messagesReceived;
    if (totalMessages % 10 === 0) {
      this.log('debug', 'WebSocket message activity', {
        connectionId,
        messagesSent: metrics.messagesSent,
        messagesReceived: metrics.messagesReceived,
        messageType
      });
    }
  }

  public recordReconnectionAttempt(connectionId: string): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) {
      return;
    }

    metrics.reconnectionAttempts++;
    this.log('info', 'WebSocket reconnection attempt', {
      connectionId,
      attempt: metrics.reconnectionAttempts
    });
  }

  public updateQuotaStatus(connectionId: string, status: 'ok' | 'warning' | 'exceeded'): void {
    const metrics = this.connections.get(connectionId);
    if (!metrics) {
      return;
    }

    metrics.quotaStatus = status;
    if (status === 'exceeded') {
      this.log('warn', 'Quota status updated to exceeded', { connectionId });
    }
  }

  public getConnectionMetrics(connectionId: string): WebSocketConnectionMetrics | undefined {
    return this.connections.get(connectionId);
  }

  public getQuotaMetrics(): QuotaUsageMetrics {
    return { ...this.quotaMetrics };
  }

  public getActiveConnections(): WebSocketConnectionMetrics[] {
    return Array.from(this.connections.values()).filter(
      metrics => metrics.state === 'connecting' || metrics.state === 'connected'
    );
  }

  public getConnectionHistory(limit: number = 10): WebSocketConnectionMetrics[] {
    return Array.from(this.connections.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  public getHealthReport(): {
    status: 'healthy' | 'degraded' | 'critical';
    summary: string;
    details: {
      activeConnections: number;
      totalConnections: number;
      successfulConnections: number;
      failedConnections: number;
      quotaExceededErrors: number;
      successRate: string;
      averageConnectionDuration: number;
      recentFailures: number;
      apiKeyUsage: Record<string, number>;
      hourlyUsage: Record<number, number>;
    };
  } {
    const activeConnections = this.getActiveConnections().length;
    const recentFailures = this.getConnectionHistory(10).filter(
      metrics => metrics.state === 'error' || metrics.state === 'timeout'
    ).length;
    
    const successRate = this.quotaMetrics.totalConnections > 0 
      ? (this.quotaMetrics.successfulConnections / this.quotaMetrics.totalConnections * 100)
      : 100;

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    let summary = 'All systems operational';

    if (this.quotaMetrics.quotaExceededErrors > 0) {
      status = 'critical';
      summary = `Quota exceeded errors detected (${this.quotaMetrics.quotaExceededErrors})`;
    } else if (successRate < 80) {
      status = 'critical';
      summary = `Low success rate (${successRate.toFixed(1)}%)`;
    } else if (recentFailures >= 5) {
      status = 'degraded';
      summary = `High failure rate in recent connections (${recentFailures}/10)`;
    } else if (successRate < 95) {
      status = 'degraded';
      summary = `Moderate success rate (${successRate.toFixed(1)}%)`;
    }

    return {
      status,
      summary,
      details: {
        activeConnections,
        totalConnections: this.quotaMetrics.totalConnections,
        successfulConnections: this.quotaMetrics.successfulConnections,
        failedConnections: this.quotaMetrics.failedConnections,
        quotaExceededErrors: this.quotaMetrics.quotaExceededErrors,
        successRate: successRate.toFixed(1) + '%',
        averageConnectionDuration: this.quotaMetrics.averageConnectionDuration,
        recentFailures,
        apiKeyUsage: Object.fromEntries(this.quotaMetrics.apiKeyUsage),
        hourlyUsage: Object.fromEntries(this.quotaMetrics.hourlyUsage)
      }
    };
  }

  private updateAverageConnectionDuration(): void {
    const completedConnections = Array.from(this.connections.values()).filter(
      metrics => metrics.duration !== undefined
    );

    if (completedConnections.length > 0) {
      const totalDuration = completedConnections.reduce(
        (sum, metrics) => sum + (metrics.duration || 0), 0
      );
      this.quotaMetrics.averageConnectionDuration = Math.round(totalDuration / completedConnections.length);
    }
  }

  public clearOldConnections(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxAge;
    const toDelete: string[] = [];

    for (const [connectionId, metrics] of this.connections) {
      if (metrics.startTime < cutoffTime && metrics.state !== 'connecting' && metrics.state !== 'connected') {
        toDelete.push(connectionId);
      }
    }

    toDelete.forEach(connectionId => this.connections.delete(connectionId));
    
    if (toDelete.length > 0) {
      this.log('info', `Cleaned up ${toDelete.length} old connection records`);
    }
  }

  public exportMetrics(): {
    quotaMetrics: QuotaUsageMetrics;
    activeConnections: WebSocketConnectionMetrics[];
    recentHistory: WebSocketConnectionMetrics[];
    healthReport: {
      status: 'healthy' | 'degraded' | 'critical';
      summary: string;
      details: {
        activeConnections: number;
        totalConnections: number;
        successfulConnections: number;
        failedConnections: number;
        quotaExceededErrors: number;
        successRate: string;
        averageConnectionDuration: number;
        recentFailures: number;
        apiKeyUsage: Record<string, number>;
        hourlyUsage: Record<number, number>;
      };
    };
    exportTime: string;
  } {
    return {
      quotaMetrics: this.getQuotaMetrics(),
      activeConnections: this.getActiveConnections(),
      recentHistory: this.getConnectionHistory(20),
      healthReport: this.getHealthReport(),
      exportTime: new Date().toISOString()
    };
  }
}

export const webSocketMonitor = WebSocketMonitor.getInstance();

/**
 * Specialized error types for WebSocket transcription system
 * Provides context-specific error handling and recovery mechanisms
 */

export enum TranscriptionErrorType {
  STACK_OVERFLOW = 'STACK_OVERFLOW',
  RECURSIVE_CALL = 'RECURSIVE_CALL',
  WEBSOCKET_CONNECTION = 'WEBSOCKET_CONNECTION',
  AUDIO_PROCESSING = 'AUDIO_PROCESSING',
  STATE_MANAGER = 'STATE_MANAGER',
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  TIMEOUT = 'TIMEOUT',
  INVALID_AUDIO = 'INVALID_AUDIO',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTHENTICATION = 'AUTHENTICATION'
}

export class TranscriptionError extends Error {
  public readonly type: TranscriptionErrorType;
  public readonly context: Record<string, any>;
  public readonly timestamp: number;
  public readonly callStack?: string;
  public readonly recoveryStrategy?: string;

  constructor(
    type: TranscriptionErrorType,
    message: string,
    context: Record<string, any> = {},
    recoveryStrategy?: string
  ) {
    super(message);
    this.name = 'TranscriptionError';
    this.type = type;
    this.context = context;
    this.timestamp = Date.now();
    this.callStack = new Error().stack;
    this.recoveryStrategy = recoveryStrategy;
  }

  public toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      callStack: this.callStack,
      recoveryStrategy: this.recoveryStrategy
    };
  }
}

export class StackOverflowError extends TranscriptionError {
  public readonly maxDepth: number;
  public readonly currentDepth: number;

  constructor(
    message: string,
    currentDepth: number,
    maxDepth: number,
    context: Record<string, any> = {}
  ) {
    super(
      TranscriptionErrorType.STACK_OVERFLOW,
      message,
      { ...context, currentDepth, maxDepth },
      'Reset transcription session and implement call depth protection'
    );
    this.maxDepth = maxDepth;
    this.currentDepth = currentDepth;
  }
}

export class RecursiveCallError extends TranscriptionError {
  public readonly functionName: string;
  public readonly callCount: number;

  constructor(
    functionName: string,
    callCount: number,
    context: Record<string, any> = {}
  ) {
    super(
      TranscriptionErrorType.RECURSIVE_CALL,
      `Recursive call detected in ${functionName} (count: ${callCount})`,
      { ...context, functionName, callCount },
      'Implement duplicate call detection and cooldown period'
    );
    this.functionName = functionName;
    this.callCount = callCount;
  }
}

export class CircuitBreakerError extends TranscriptionError {
  public readonly breakerState: string;
  public readonly failureCount: number;

  constructor(
    breakerState: string,
    failureCount: number,
    context: Record<string, any> = {}
  ) {
    super(
      TranscriptionErrorType.CIRCUIT_BREAKER,
      `Circuit breaker activated: ${breakerState} (failures: ${failureCount})`,
      { ...context, breakerState, failureCount },
      'Wait for circuit breaker reset or manual intervention'
    );
    this.breakerState = breakerState;
    this.failureCount = failureCount;
  }
}

export class AudioProcessingError extends TranscriptionError {
  public readonly audioFormat?: string;
  public readonly sampleRate?: number;
  public readonly duration?: number;

  constructor(
    message: string,
    context: Record<string, any> = {},
    audioFormat?: string,
    sampleRate?: number,
    duration?: number
  ) {
    super(
      TranscriptionErrorType.AUDIO_PROCESSING,
      message,
      { ...context, audioFormat, sampleRate, duration },
      'Validate audio format and retry with supported parameters'
    );
    this.audioFormat = audioFormat;
    this.sampleRate = sampleRate;
    this.duration = duration;
  }
}

export class WebSocketConnectionError extends TranscriptionError {
  public readonly connectionState: string;
  public readonly lastPingTime?: number;

  constructor(
    message: string,
    connectionState: string,
    context: Record<string, any> = {},
    lastPingTime?: number
  ) {
    super(
      TranscriptionErrorType.WEBSOCKET_CONNECTION,
      message,
      { ...context, connectionState, lastPingTime },
      'Reconnect WebSocket with exponential backoff'
    );
    this.connectionState = connectionState;
    this.lastPingTime = lastPingTime;
  }
}

/**
 * Error recovery strategies for different error types
 */
export class TranscriptionErrorRecovery {
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;
  private static readonly BACKOFF_MULTIPLIER = 2;
  private static readonly BASE_DELAY = 1000; // 1 second

  public static async recoverFromError(
    error: TranscriptionError,
    attemptCount: number = 0
  ): Promise<boolean> {
    if (attemptCount >= this.MAX_RECOVERY_ATTEMPTS) {
      console.error('Max recovery attempts reached', error.toJSON());
      return false;
    }

    console.log(`Attempting recovery for ${error.type} (attempt ${attemptCount + 1})`);

    switch (error.type) {
      case TranscriptionErrorType.STACK_OVERFLOW:
      case TranscriptionErrorType.RECURSIVE_CALL:
        // Reset state and wait before retry
        await this.delay(this.BASE_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, attemptCount));
        return true;

      case TranscriptionErrorType.WEBSOCKET_CONNECTION:
        // Exponential backoff for connection issues
        await this.delay(this.BASE_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, attemptCount));
        return true;

      case TranscriptionErrorType.CIRCUIT_BREAKER:
        // Wait longer for circuit breaker recovery
        await this.delay(this.BASE_DELAY * 5 * Math.pow(this.BACKOFF_MULTIPLIER, attemptCount));
        return true;

      case TranscriptionErrorType.RATE_LIMIT:
        // Exponential backoff for rate limiting
        await this.delay(this.BASE_DELAY * 10 * Math.pow(this.BACKOFF_MULTIPLIER, attemptCount));
        return true;

      case TranscriptionErrorType.AUDIO_PROCESSING:
        // Quick retry for audio issues
        await this.delay(this.BASE_DELAY / 2);
        return true;

      default:
        // Generic retry with moderate delay
        await this.delay(this.BASE_DELAY);
        return true;
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Centralized error reporting and metrics collection
 */
export class TranscriptionErrorReporter {
  private static errorCounts = new Map<TranscriptionErrorType, number>();
  private static lastErrors = new Map<TranscriptionErrorType, TranscriptionError>();

  public static reportError(error: TranscriptionError): void {
    // Update error counts
    const currentCount = this.errorCounts.get(error.type) || 0;
    this.errorCounts.set(error.type, currentCount + 1);
    this.lastErrors.set(error.type, error);

    // Log error with full context
    console.error(`[${error.type}] ${error.message}`, {
      context: error.context,
      timestamp: new Date(error.timestamp).toISOString(),
      recoveryStrategy: error.recoveryStrategy,
      errorCount: currentCount + 1
    });

    // Trigger alerts for critical errors
    if (this.isCriticalError(error)) {
      this.triggerAlert(error);
    }
  }

  public static getErrorStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [type, count] of this.errorCounts.entries()) {
      const lastError = this.lastErrors.get(type);
      stats[type] = {
        count,
        lastOccurrence: lastError ? new Date(lastError.timestamp).toISOString() : null,
        lastMessage: lastError?.message || null
      };
    }

    return stats;
  }

  private static isCriticalError(error: TranscriptionError): boolean {
    const criticalTypes = [
      TranscriptionErrorType.STACK_OVERFLOW,
      TranscriptionErrorType.RECURSIVE_CALL,
      TranscriptionErrorType.CIRCUIT_BREAKER
    ];
    
    return criticalTypes.includes(error.type) || 
           (this.errorCounts.get(error.type) || 0) > 5;
  }

  private static triggerAlert(error: TranscriptionError): void {
    // In a real application, this would send alerts to monitoring systems
    console.warn('CRITICAL TRANSCRIPTION ERROR DETECTED:', error.toJSON());
  }

  public static reset(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
  }
}

/**
 * WebSocket Diagnostic Logger
 * Comprehensive logging system for debugging Gemini Live API transcription timeouts
 */

interface LogEvent {
  timestamp: number;
  event: string;
  data?: Record<string, unknown>;
  stage: 'connection' | 'audio' | 'response' | 'timeout' | 'error';
  sessionId?: string;
}

interface DiagnosticSession {
  sessionId: string;
  startTime: number;
  events: LogEvent[];
  connectionState: string;
  audioSent: boolean;
  responseReceived: boolean;
  finalResult: string;
}

class WebSocketDiagnosticLogger {
  private session: DiagnosticSession | null = null;
  private diagnosticMode = false;
  private logBuffer: LogEvent[] = [];

  enableDiagnosticMode(enabled: boolean = true) {
    this.diagnosticMode = enabled;
    if (enabled) {
      console.log('🔍 WebSocket Diagnostic Mode ENABLED - Verbose logging active');
    }
  }

  startSession(sessionId: string) {
    this.session = {
      sessionId,
      startTime: Date.now(),
      events: [],
      connectionState: 'initializing',
      audioSent: false,
      responseReceived: false,
      finalResult: ''
    };
    
    this.logEvent('session_started', { sessionId }, 'connection');
  }

  logEvent(event: string, data?: Record<string, unknown>, stage: 'connection' | 'audio' | 'response' | 'timeout' | 'error' = 'connection') {
    const timestamp = Date.now();
    const logEntry: LogEvent = {
      timestamp,
      event,
      data,
      stage,
      sessionId: this.session?.sessionId
    };

    // Add to session if active
    if (this.session) {
      this.session.events.push(logEntry);
    }

    // Add to buffer for analysis
    this.logBuffer.push(logEntry);

    // Log to console if diagnostic mode is enabled
    if (this.diagnosticMode) {
      const timeFromStart = this.session ? timestamp - this.session.startTime : 0;
      console.log(`🔍 [${stage.toUpperCase()}] +${timeFromStart}ms: ${event}`, data || '');
    }

    // Update session state tracking
    this.updateSessionState(event, data);
  }

  private updateSessionState(event: string, data?: Record<string, unknown>) {
    if (!this.session) return;

    switch (event) {
      case 'websocket_connected':
        this.session.connectionState = 'connected';
        break;
      case 'audio_sent':
        this.session.audioSent = true;
        break;
      case 'message_received':
        this.session.responseReceived = true;
        break;
      case 'timeout_triggered':
        this.session.finalResult = 'timeout';
        break;
      case 'transcription_complete':
        this.session.finalResult = (data?.text as string) || 'empty';
        break;
    }
  }

  logConnectionState(newState: string, previousState?: string) {
    this.logEvent('connection_state_change', {
      from: previousState,
      to: newState,
      timestamp: Date.now()
    }, 'connection');
  }

  logAudioTransmission(audioSize: number, audioFormat?: Record<string, unknown>) {
    this.logEvent('audio_sent', {
      size: audioSize,
      format: audioFormat,
      timestamp: Date.now()
    }, 'audio');
  }

  logMessageReceived(messageType: string, payload?: Record<string, unknown>) {
    this.logEvent('message_received', {
      type: messageType,
      payload: this.diagnosticMode ? payload : '[payload hidden - enable diagnostic mode]',
      timestamp: Date.now()
    }, 'response');
  }

  logTimeout(timeoutType: string, duration: number, reason?: string) {
    this.logEvent('timeout_triggered', {
      type: timeoutType,
      duration,
      reason,
      timestamp: Date.now()
    }, 'timeout');
  }

  logError(error: Error | string | Record<string, unknown>, context?: string) {
    this.logEvent('error_occurred', {
      error: error instanceof Error ? error.message : String(error),
      context,
      timestamp: Date.now()
    }, 'error');
  }

  endSession(result?: Record<string, unknown>) {
    if (!this.session) return;

    const endTime = Date.now();
    const duration = endTime - this.session.startTime;
    
    this.logEvent('session_ended', {
      duration,
      result: (result?.text as string) || 'no result',
      audioSent: this.session.audioSent,
      responseReceived: this.session.responseReceived
    }, 'connection');

    if (this.diagnosticMode) {
      this.printSessionSummary();
    }

    this.session = null;
  }

  private printSessionSummary() {
    if (!this.session) return;

    const duration = Date.now() - this.session.startTime;
    console.log('🔍 SESSION SUMMARY:');
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Audio Sent: ${this.session.audioSent}`);
    console.log(`  Response Received: ${this.session.responseReceived}`);
    console.log(`  Final Result: ${this.session.finalResult}`);
    console.log(`  Events: ${this.session.events.length}`);

    // Find timeout events
    const timeoutEvents = this.session.events.filter(e => e.stage === 'timeout');
    if (timeoutEvents.length > 0) {
      console.log('⚠️ TIMEOUT EVENTS DETECTED:');
      timeoutEvents.forEach(event => {
        const timeFromStart = event.timestamp - this.session!.startTime;
        console.log(`  - ${event.event} at +${timeFromStart}ms:`, event.data);
      });
    }

    // Analyze timing patterns
    this.analyzeEventTiming();
  }

  private analyzeEventTiming() {
    if (!this.session) return;

    const events = this.session.events;
    const startTime = this.session.startTime;

    console.log('🔍 EVENT TIMELINE:');
    events.forEach((event, index) => {
      const timeFromStart = event.timestamp - startTime;
      const prevEvent = events[index - 1];
      const timeDiff = prevEvent ? event.timestamp - prevEvent.timestamp : 0;
      
      console.log(`  ${timeFromStart.toString().padStart(6, ' ')}ms (+${timeDiff.toString().padStart(4, ' ')}ms): [${event.stage.toUpperCase()}] ${event.event}`);
    });

    // Look for the 3-second pattern
    const threeSecondMark = events.find(e => {
      const timeFromStart = e.timestamp - startTime;
      return timeFromStart >= 2900 && timeFromStart <= 3100; // Around 3 seconds
    });

    if (threeSecondMark) {
      console.log('⚠️ FOUND EVENT NEAR 3-SECOND MARK:', threeSecondMark);
    }
  }

  // Get current session diagnostic data
  getSessionDiagnostics() {
    return this.session;
  }

  // Get recent log entries for analysis
  getRecentLogs(count: number = 50) {
    return this.logBuffer.slice(-count);
  }

  // Clear log buffer to prevent memory issues
  clearLogBuffer() {
    this.logBuffer = [];
  }
}

// Create singleton instance
export const websocketDiagnosticLogger = new WebSocketDiagnosticLogger();

// Helper function to enable diagnostic mode from console
declare global {
  interface Window {
    enableWebSocketDiagnostics: (enabled?: boolean) => void;
  }
}

(globalThis as unknown as Window).enableWebSocketDiagnostics = (enabled: boolean = true) => {
  websocketDiagnosticLogger.enableDiagnosticMode(enabled);
  console.log(`WebSocket diagnostics ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

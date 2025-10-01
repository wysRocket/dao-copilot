// Lightweight telemetry counters for transcription pipeline reliability & latency analysis
// Intentionally simple (in-memory) so we can later wire to a real metrics backend.

export interface CounterMap {
  [name: string]: number
}

class TranscriptionTelemetry {
  private counters: CounterMap = {}

  increment(name: string, by = 1): void {
    this.counters[name] = (this.counters[name] || 0) + by
  }

  get(name: string): number {
    return this.counters[name] || 0
  }

  snapshot(): CounterMap {
    return {...this.counters}
  }

  reset(name?: string): void {
    if (name) delete this.counters[name]
    else this.counters = {}
  }
}

const instance = new TranscriptionTelemetry()
export function getTranscriptionTelemetry() {
  return instance
}

// Common counter names (centralized to avoid typos)
export const TELEMETRY_COUNTERS = {
  EARLY_FLUSH: 'early_flush_count',
  MANUAL_STOP_FLUSH: 'manual_stop_flush_count',
  INTERVAL_FLUSH: 'interval_flush_count',
  SILENCE_SKIPPED: 'silence_skipped_count',
  SILENCE_DELIVERED: 'silence_delivered_count',
  EMPTY_DELIVERED: 'empty_transcript_delivered_count',
  NON_EMPTY_DELIVERED: 'non_empty_transcript_delivered_count'
} as const

export type TelemetryCounterName = (typeof TELEMETRY_COUNTERS)[keyof typeof TELEMETRY_COUNTERS]

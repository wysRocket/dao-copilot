/**
 * Centralized feature flags for transcription pipeline hardening & latency improvements.
 */

// In the renderer (Vite), process.env is not defined unless polyfilled. Use a safe accessor.
// Support both Electron main (process.env) and renderer via import.meta.env style fallbacks.
function flag(value: unknown): boolean {
  if (typeof value === 'string') {
    return value === '1' || value.toLowerCase() === 'true'
  }
  return false
}

// Attempt to read from process.env if available, otherwise from (import.meta as any).env
interface ImportMetaEnvLike {
  [key: string]: string | undefined
}

const env: Record<string, string | undefined> = ((): Record<string, string | undefined> => {
  const pEnv: Record<string, string | undefined> =
    typeof process !== 'undefined' &&
    (process as unknown as {env?: Record<string, string | undefined>})?.env
      ? (process as unknown as {env: Record<string, string | undefined>}).env
      : {}
  let iEnv: ImportMetaEnvLike = {}
  try {
    // Access guarded for non-Vite contexts
    const meta = import.meta as unknown as {env?: ImportMetaEnvLike}
    if (typeof meta !== 'undefined' && meta && meta.env) {
      iEnv = meta.env
    }
  } catch {
    // Ignore if not available
  }
  return {...iEnv, ...pEnv}
})()

export const TranscriptionFlags = {
  ENABLE_FSM: flag(env.ENABLE_TRANSCRIPT_FSM),
  ENABLE_ORPHAN_WORKER: flag(env.ENABLE_ORPHAN_WORKER)
}

export type TranscriptionFlagKeys = keyof typeof TranscriptionFlags

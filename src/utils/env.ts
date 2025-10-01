/**
 * Runtime environment utilities that work in both Node and browser contexts.
 *
 * These helpers provide safe access to environment variables regardless of
 * whether the code executes in a Vite-powered renderer (import.meta.env), an
 * Electron preload script, or a Node.js process.
 */

export interface ReadEnvOptions {
  /** Additional keys to try if the primary key is not present */
  fallbackKeys?: string[]
  /** Default value to return when nothing is found */
  defaultValue?: string
  /** Treat empty strings as valid values (defaults to false) */
  allowEmpty?: boolean
  /** Throw when the resolved value is missing or empty */
  required?: boolean
}

function coerceEnvValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined
  }

  return undefined
}

function readFromImportMeta(key: string): string | undefined {
  try {
    const metaEnv = (import.meta as unknown as {env?: Record<string, unknown>})?.env
    if (!metaEnv) return undefined
    return coerceEnvValue(metaEnv[key])
  } catch {
    return undefined
  }
}

function readFromProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) {
    return undefined
  }
  return coerceEnvValue(process.env[key])
}

function readFromWindowEnv(key: string): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const env = (window as {__ENV__?: Record<string, unknown>}).__ENV__
  if (!env) {
    return undefined
  }

  return coerceEnvValue(env[key])
}

function resolveEnvValue(key: string): string | undefined {
  return readFromImportMeta(key) ?? readFromProcessEnv(key) ?? readFromWindowEnv(key)
}

export function readRuntimeEnv(key: string, options: ReadEnvOptions = {}): string | undefined {
  const keys = [key, ...(options.fallbackKeys ?? [])]

  for (const currentKey of keys) {
    const value = resolveEnvValue(currentKey)
    if (value !== undefined && (options.allowEmpty || value.trim().length > 0)) {
      return value
    }
  }

  if (options.required) {
    const attemptedKeys = keys.join(', ')
    throw new Error(`Missing required environment variable. Tried: ${attemptedKeys}`)
  }

  return options.defaultValue
}

export function requireRuntimeEnv(key: string, options: ReadEnvOptions = {}): string {
  return readRuntimeEnv(key, {...options, required: true}) as string
}

export function isDevelopmentEnvironment(): boolean {
  const metaValue = readFromImportMeta('DEV')
  if (metaValue !== undefined) {
    return metaValue === 'true'
  }

  const nodeEnv = readFromProcessEnv('NODE_ENV')
  return nodeEnv === 'development'
}

const TRUE_ENV_VALUES = new Set(['true', '1', 'on', 'yes'])
const FALSE_ENV_VALUES = new Set(['false', '0', 'off', 'no'])

export function readBooleanEnv(
  key: string,
  fallback: boolean,
  options: ReadEnvOptions = {}
): boolean {
  const value = readRuntimeEnv(key, {...options, allowEmpty: true})
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (TRUE_ENV_VALUES.has(normalized)) {
    return true
  }

  if (FALSE_ENV_VALUES.has(normalized)) {
    return false
  }

  return fallback
}

export function readNumericEnv(
  key: string,
  fallback: number,
  options: ReadEnvOptions = {}
): number {
  const value = readRuntimeEnv(key, {...options, allowEmpty: true})
  if (value === undefined) {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

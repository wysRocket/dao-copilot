/**
 * Production-safe logging utility
 * Automatically removes console logs in production builds
 */

const isDevelopment = process.env.NODE_ENV === 'development'
const isProduction = process.env.NODE_ENV === 'production'

export const logger = {
  log: isDevelopment ? console.log : () => {},
  warn: console.warn, // Keep warnings in production for debugging
  error: console.error, // Keep errors in production for debugging
  debug: isDevelopment ? console.debug : () => {},
  info: isDevelopment ? console.info : () => {},
  group: isDevelopment ? console.group : () => {},
  groupEnd: isDevelopment ? console.groupEnd : () => {},
  groupCollapsed: isDevelopment ? console.groupCollapsed : () => {}
}

// For debugging purposes only - remove in production
export const devLog = isDevelopment ? console.log : () => {}

// Always log critical production events
export const prodLog = console.log

// Environment helpers
export const env = {
  isDevelopment,
  isProduction,
  isTest: process.env.NODE_ENV === 'test'
}

export default logger

#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
/**
 * Parse GEMINI_SIGNAL_VALIDATE log lines and summarize metrics.
 * Usage: node scripts/parse-validation-metrics.mjs <logfile>
 */
import fs from 'fs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/parse-validation-metrics.mjs <logfile>')
  process.exit(1)
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)

const events = []
for (const line of lines) {
  if (!line.includes('GEMINI_SIGNAL_VALIDATE')) continue
  // Extract JSON after marker if log format is "... GEMINI_SIGNAL_VALIDATE {json}" or line is JSON only
  const jsonStart = line.indexOf('{')
  if (jsonStart === -1) continue
  try {
    const obj = JSON.parse(line.slice(jsonStart))
    events.push(obj)
  } catch {
    // ignore parse errors
  }
}

// (Scenarios mapping can be added later if we auto-classify logs.)

const metrics = {
  totalPartials: 0,
  finals: 0,
  firstPartialLatencies: [],
  finalLatencies: []
}

for (const e of events) {
  if (e.kind === 'text-partial') {
    metrics.totalPartials++
  } else if (e.kind === 'text-final') {
    metrics.finals++
    if (typeof e.latency_first_partial_ms === 'number')
      metrics.firstPartialLatencies.push(e.latency_first_partial_ms)
    if (typeof e.latency_final_ms === 'number') metrics.finalLatencies.push(e.latency_final_ms)
  }
}

function avg(arr) {
  return arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 'n/a'
}
function p95(arr) {
  if (!arr.length) return 'n/a'
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(0.95 * (s.length - 1))].toFixed(1)
}

console.log('Validation Summary')
console.log('------------------')
console.log('Total partial events:', metrics.totalPartials)
console.log('Final events:', metrics.finals)
console.log('Avg first partial latency (ms):', avg(metrics.firstPartialLatencies))
console.log('Avg final latency (ms):', avg(metrics.finalLatencies))
console.log('P95 final latency (ms):', p95(metrics.finalLatencies))

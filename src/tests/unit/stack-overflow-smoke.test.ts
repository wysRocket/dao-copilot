/**
 * Simple smoke test for Stack Overflow Fixes
 */

import { describe, it, expect } from 'vitest'
import { 
  StackOverflowError, 
  RecursiveCallError,
  TranscriptionErrorReporter,
  TranscriptionErrorType
} from '../../services/transcription-errors'

describe('Stack Overflow Fix Smoke Test', () => {
  it('should create and handle StackOverflowError correctly', () => {
    const error = new StackOverflowError('Test overflow', 5, 3, { test: true })
    
    expect(error.type).toBe(TranscriptionErrorType.STACK_OVERFLOW)
    expect(error.currentDepth).toBe(5)
    expect(error.maxDepth).toBe(3)
    expect(error.message).toBe('Test overflow')
    expect(error.context.test).toBe(true)
    expect(error.recoveryStrategy).toContain('Reset transcription session')
  })

  it('should create and handle RecursiveCallError correctly', () => {
    const error = new RecursiveCallError('testFunction', 3, { context: 'test' })
    
    expect(error.type).toBe(TranscriptionErrorType.RECURSIVE_CALL)
    expect(error.functionName).toBe('testFunction')
    expect(error.callCount).toBe(3)
    expect(error.context.context).toBe('test')
    expect(error.recoveryStrategy).toContain('duplicate call detection')
  })

  it('should track errors in error reporter', () => {
    TranscriptionErrorReporter.reset()
    
    const error1 = new StackOverflowError('Error 1', 3, 2)
    const error2 = new RecursiveCallError('func', 5)
    
    TranscriptionErrorReporter.reportError(error1)
    TranscriptionErrorReporter.reportError(error2)
    
    const stats = TranscriptionErrorReporter.getErrorStats()
    
    expect(stats[TranscriptionErrorType.STACK_OVERFLOW]).toBeDefined()
    expect(stats[TranscriptionErrorType.STACK_OVERFLOW].count).toBe(1)
    expect(stats[TranscriptionErrorType.RECURSIVE_CALL]).toBeDefined()
    expect(stats[TranscriptionErrorType.RECURSIVE_CALL].count).toBe(1)
  })

  it('should provide error context as JSON', () => {
    const error = new StackOverflowError('Test', 3, 2, { additional: 'data' })
    const json = error.toJSON()
    
    expect(json.name).toBe('TranscriptionError')
    expect(json.type).toBe(TranscriptionErrorType.STACK_OVERFLOW)
    expect(json.message).toBe('Test')
    expect(json.context.additional).toBe('data')
    expect(typeof json.timestamp).toBe('number')
    expect(json.recoveryStrategy).toBeDefined()
  })
})

/**
 * WalEntry - Write-Ahead Log Entry Type Definitions
 *
 * Defines the structure and types for WAL entries that will be serialized
 * to the binary format. Supports multiple entry types for different operations.
 */

import {TranscriptUtterance, TranscriptState} from '../transcription/fsm/TranscriptStates'

/**
 * WAL Format Version for future evolution
 */
export const WAL_FORMAT_VERSION = 1

/**
 * Entry types supported in the WAL
 */
export enum WalEntryType {
  // Transcript operations
  UTTERANCE_INSERT = 0x01,
  UTTERANCE_UPDATE = 0x02,
  UTTERANCE_DELETE = 0x03,

  // Session operations
  SESSION_CREATE = 0x10,
  SESSION_DELETE = 0x11,

  // Control operations
  CHECKPOINT = 0x20,
  FLUSH = 0x21,
  ROTATION = 0x22,

  // Recovery markers
  RECOVERY_START = 0x30,
  RECOVERY_END = 0x31

  // Future extensibility (0x40-0xFF reserved)
}

/**
 * Base WAL entry interface
 */
export interface WalEntryBase {
  type: WalEntryType
  version: number
  timestamp: number // Unix timestamp in milliseconds
  checksum: number // CRC32 checksum of the payload
  payloadSize: number // Size of the payload in bytes
}

/**
 * Utterance insert entry - for new utterances
 */
export interface WalUtteranceInsert extends WalEntryBase {
  type: WalEntryType.UTTERANCE_INSERT
  payload: {
    utterance: TranscriptUtterance
    sessionId: string
  }
}

/**
 * Utterance update entry - for partial updates, state changes, etc.
 */
export interface WalUtteranceUpdate extends WalEntryBase {
  type: WalEntryType.UTTERANCE_UPDATE
  payload: {
    utteranceId: string
    sessionId: string
    updates: Partial<TranscriptUtterance>
    previousState?: TranscriptState
  }
}

/**
 * Utterance delete entry - for removing utterances
 */
export interface WalUtteranceDelete extends WalEntryBase {
  type: WalEntryType.UTTERANCE_DELETE
  payload: {
    utteranceId: string
    sessionId: string
    reason: 'user_delete' | 'privacy_cleanup' | 'retention_policy' | 'error_recovery'
  }
}

/**
 * Session create entry - for tracking session lifecycle
 */
export interface WalSessionCreate extends WalEntryBase {
  type: WalEntryType.SESSION_CREATE
  payload: {
    sessionId: string
    metadata?: Record<string, unknown>
  }
}

/**
 * Session delete entry - for privacy compliance
 */
export interface WalSessionDelete extends WalEntryBase {
  type: WalEntryType.SESSION_DELETE
  payload: {
    sessionId: string
    utteranceCount: number
    reason: 'user_request' | 'privacy_policy' | 'retention_policy'
  }
}

/**
 * Checkpoint entry - marks a consistent point in the log
 */
export interface WalCheckpoint extends WalEntryBase {
  type: WalEntryType.CHECKPOINT
  payload: {
    sequenceNumber: number
    utteranceCount: number
    sessionCount: number
  }
}

/**
 * Flush entry - marks a forced flush operation
 */
export interface WalFlush extends WalEntryBase {
  type: WalEntryType.FLUSH
  payload: {
    reason: 'timer' | 'count_threshold' | 'explicit' | 'shutdown'
    entriesFlushed: number
  }
}

/**
 * Rotation entry - marks WAL file rotation
 */
export interface WalRotation extends WalEntryBase {
  type: WalEntryType.ROTATION
  payload: {
    oldFileName: string
    newFileName: string
    reason: 'size_limit' | 'time_limit' | 'explicit'
  }
}

/**
 * Recovery markers for crash recovery
 */
export interface WalRecoveryStart extends WalEntryBase {
  type: WalEntryType.RECOVERY_START
  payload: {
    recoveryId: string
    startTime: number
    walFiles: string[]
  }
}

export interface WalRecoveryEnd extends WalEntryBase {
  type: WalEntryType.RECOVERY_END
  payload: {
    recoveryId: string
    endTime: number
    recoveredEntries: number
    success: boolean
  }
}

/**
 * Union type for all WAL entry types
 */
export type WalEntry =
  | WalUtteranceInsert
  | WalUtteranceUpdate
  | WalUtteranceDelete
  | WalSessionCreate
  | WalSessionDelete
  | WalCheckpoint
  | WalFlush
  | WalRotation
  | WalRecoveryStart
  | WalRecoveryEnd

/**
 * Binary format header structure (fixed 24 bytes)
 *
 * Layout:
 * - Magic bytes (4): 'TWAL' (0x54574142)
 * - Version (1): Format version number
 * - Entry Type (1): Entry type enum value
 * - Reserved (2): Future use
 * - Timestamp (8): Unix timestamp in milliseconds (little-endian)
 * - Payload Size (4): Size of payload in bytes (little-endian)
 * - Checksum (4): CRC32 checksum of payload (little-endian)
 */
export const WAL_HEADER_SIZE = 24
export const WAL_MAGIC_BYTES = 0x54574142 // 'TWAL'

/**
 * WAL file header structure (written at start of each WAL file)
 */
export interface WalFileHeader {
  magic: number // Should be WAL_MAGIC_BYTES
  version: number
  created: number // Creation timestamp
  nodeId: string // Node identifier (for distributed systems)
  sessionId?: string // Optional session identifier
}

/**
 * Entry creation helpers
 */
export class WalEntryFactory {
  private static sequenceNumber = 0

  /**
   * Create an utterance insert entry
   */
  static createUtteranceInsert(utterance: TranscriptUtterance): WalUtteranceInsert {
    return {
      type: WalEntryType.UTTERANCE_INSERT,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0, // Will be calculated during encoding
      payloadSize: 0, // Will be calculated during encoding
      payload: {
        utterance: {...utterance}, // Clone to prevent mutations
        sessionId: utterance.sessionId
      }
    }
  }

  /**
   * Create an utterance update entry
   */
  static createUtteranceUpdate(
    utteranceId: string,
    sessionId: string,
    updates: Partial<TranscriptUtterance>,
    previousState?: TranscriptState
  ): WalUtteranceUpdate {
    return {
      type: WalEntryType.UTTERANCE_UPDATE,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        utteranceId,
        sessionId,
        updates: {...updates},
        previousState
      }
    }
  }

  /**
   * Create an utterance delete entry
   */
  static createUtteranceDelete(
    utteranceId: string,
    sessionId: string,
    reason: WalUtteranceDelete['payload']['reason']
  ): WalUtteranceDelete {
    return {
      type: WalEntryType.UTTERANCE_DELETE,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        utteranceId,
        sessionId,
        reason
      }
    }
  }

  /**
   * Create a session create entry
   */
  static createSessionCreate(
    sessionId: string,
    metadata?: Record<string, unknown>
  ): WalSessionCreate {
    return {
      type: WalEntryType.SESSION_CREATE,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        sessionId,
        metadata: metadata ? {...metadata} : undefined
      }
    }
  }

  /**
   * Create a session delete entry
   */
  static createSessionDelete(
    sessionId: string,
    utteranceCount: number,
    reason: WalSessionDelete['payload']['reason']
  ): WalSessionDelete {
    return {
      type: WalEntryType.SESSION_DELETE,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        sessionId,
        utteranceCount,
        reason
      }
    }
  }

  /**
   * Create a checkpoint entry
   */
  static createCheckpoint(utteranceCount: number, sessionCount: number): WalCheckpoint {
    return {
      type: WalEntryType.CHECKPOINT,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        sequenceNumber: ++this.sequenceNumber,
        utteranceCount,
        sessionCount
      }
    }
  }

  /**
   * Create a flush entry
   */
  static createFlush(reason: WalFlush['payload']['reason'], entriesFlushed: number): WalFlush {
    return {
      type: WalEntryType.FLUSH,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        reason,
        entriesFlushed
      }
    }
  }

  /**
   * Create a rotation entry
   */
  static createRotation(
    oldFileName: string,
    newFileName: string,
    reason: WalRotation['payload']['reason']
  ): WalRotation {
    return {
      type: WalEntryType.ROTATION,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        oldFileName,
        newFileName,
        reason
      }
    }
  }

  /**
   * Create recovery start entry
   */
  static createRecoveryStart(recoveryId: string, walFiles: string[]): WalRecoveryStart {
    return {
      type: WalEntryType.RECOVERY_START,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        recoveryId,
        startTime: Date.now(),
        walFiles: [...walFiles]
      }
    }
  }

  /**
   * Create recovery end entry
   */
  static createRecoveryEnd(
    recoveryId: string,
    recoveredEntries: number,
    success: boolean
  ): WalRecoveryEnd {
    return {
      type: WalEntryType.RECOVERY_END,
      version: WAL_FORMAT_VERSION,
      timestamp: Date.now(),
      checksum: 0,
      payloadSize: 0,
      payload: {
        recoveryId,
        endTime: Date.now(),
        recoveredEntries,
        success
      }
    }
  }
}

/**
 * Utility functions for WAL entry operations
 */
export class WalEntryUtils {
  /**
   * Get human-readable name for entry type
   */
  static getEntryTypeName(type: WalEntryType): string {
    const names: Record<WalEntryType, string> = {
      [WalEntryType.UTTERANCE_INSERT]: 'UtteranceInsert',
      [WalEntryType.UTTERANCE_UPDATE]: 'UtteranceUpdate',
      [WalEntryType.UTTERANCE_DELETE]: 'UtteranceDelete',
      [WalEntryType.SESSION_CREATE]: 'SessionCreate',
      [WalEntryType.SESSION_DELETE]: 'SessionDelete',
      [WalEntryType.CHECKPOINT]: 'Checkpoint',
      [WalEntryType.FLUSH]: 'Flush',
      [WalEntryType.ROTATION]: 'Rotation',
      [WalEntryType.RECOVERY_START]: 'RecoveryStart',
      [WalEntryType.RECOVERY_END]: 'RecoveryEnd'
    }
    return names[type] || `Unknown(${type})`
  }

  /**
   * Check if entry type is an utterance operation
   */
  static isUtteranceOperation(type: WalEntryType): boolean {
    return type >= 0x01 && type <= 0x03
  }

  /**
   * Check if entry type is a session operation
   */
  static isSessionOperation(type: WalEntryType): boolean {
    return type >= 0x10 && type <= 0x11
  }

  /**
   * Check if entry type is a control operation
   */
  static isControlOperation(type: WalEntryType): boolean {
    return type >= 0x20 && type <= 0x22
  }

  /**
   * Check if entry type is a recovery operation
   */
  static isRecoveryOperation(type: WalEntryType): boolean {
    return type >= 0x30 && type <= 0x31
  }

  /**
   * Get estimated payload size for planning (before encoding)
   */
  static estimatePayloadSize(entry: WalEntry): number {
    switch (entry.type) {
      case WalEntryType.UTTERANCE_INSERT:
        // Rough estimate: utterance JSON size
        return JSON.stringify(entry.payload.utterance).length

      case WalEntryType.UTTERANCE_UPDATE:
        // Rough estimate: updates object size
        return JSON.stringify(entry.payload.updates).length + 100

      case WalEntryType.UTTERANCE_DELETE:
        // Small fixed size
        return 200

      case WalEntryType.SESSION_CREATE:
        // Variable based on metadata
        const metadataSize = entry.payload.metadata
          ? JSON.stringify(entry.payload.metadata).length
          : 0
        return 100 + metadataSize

      case WalEntryType.SESSION_DELETE:
        return 150

      default:
        // Control and recovery operations are typically small
        return 100
    }
  }
}

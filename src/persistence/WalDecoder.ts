/**
 * WalDecoder - Binary Decoding for Write-Ahead Log Entries
 *
 * Provides efficient binary deserialization of WAL entries with:
 * - CRC32 checksum verification for data integrity
 * - Variable-length decoding for strings and optional fields
 * - Version-aware format parsing with backwards compatibility
 * - Streaming support for large WAL files
 */

import {
  WalEntry,
  WalEntryType,
  WalEntryBase,
  WAL_HEADER_SIZE,
  WAL_MAGIC_BYTES,
  WalFileHeader,
  WalUtteranceInsert,
  WalUtteranceUpdate,
  WalUtteranceDelete,
  WalSessionCreate,
  WalSessionDelete,
  WalCheckpoint,
  WalFlush,
  WalRotation,
  WalRecoveryStart,
  WalRecoveryEnd
} from './WalEntry'
import {TranscriptUtterance, TranscriptState} from '../transcription/fsm/TranscriptStates'

/**
 * CRC32 implementation (matches encoder)
 */
class CRC32 {
  private static table: number[] | undefined

  private static buildTable(): number[] {
    const table = new Array(256)
    for (let i = 0; i < 256; i++) {
      let crc = i
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
      }
      table[i] = crc
    }
    return table
  }

  static calculate(data: Buffer): number {
    if (!this.table) {
      this.table = this.buildTable()
    }

    let crc = 0xffffffff
    for (let i = 0; i < data.length; i++) {
      crc = this.table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
  }
}

/**
 * Decoding errors
 */
export class WalDecodeError extends Error {
  constructor(
    message: string,
    public readonly offset?: number
  ) {
    super(message)
    this.name = 'WalDecodeError'
  }
}

/**
 * Binary buffer reader with bounds checking
 */
class BinaryReader {
  private position = 0

  constructor(private readonly buffer: Buffer) {}

  /**
   * Check if enough bytes are available
   */
  private ensureBytes(bytes: number): void {
    if (this.position + bytes > this.buffer.length) {
      throw new WalDecodeError(
        `Not enough bytes available. Need ${bytes}, have ${this.buffer.length - this.position}`,
        this.position
      )
    }
  }

  /**
   * Get current position
   */
  getPosition(): number {
    return this.position
  }

  /**
   * Check if more data is available
   */
  hasData(): boolean {
    return this.position < this.buffer.length
  }

  /**
   * Get remaining bytes count
   */
  remaining(): number {
    return this.buffer.length - this.position
  }

  /**
   * Read unsigned 8-bit integer
   */
  readUInt8(): number {
    this.ensureBytes(1)
    const value = this.buffer.readUInt8(this.position)
    this.position += 1
    return value
  }

  /**
   * Read unsigned 16-bit integer (little-endian)
   */
  readUInt16LE(): number {
    this.ensureBytes(2)
    const value = this.buffer.readUInt16LE(this.position)
    this.position += 2
    return value
  }

  /**
   * Read unsigned 32-bit integer (little-endian)
   */
  readUInt32LE(): number {
    this.ensureBytes(4)
    const value = this.buffer.readUInt32LE(this.position)
    this.position += 4
    return value
  }

  /**
   * Read 64-bit integer (little-endian, return as bigint)
   */
  readBigUInt64LE(): bigint {
    this.ensureBytes(8)
    const value = this.buffer.readBigUInt64LE(this.position)
    this.position += 8
    return value
  }

  /**
   * Read 64-bit timestamp (little-endian, return as number)
   */
  readTimestamp(): number {
    return Number(this.readBigUInt64LE())
  }

  /**
   * Read length-prefixed string (UTF-8)
   * Format: [length:4][string:utf8]
   */
  readString(): string {
    const length = this.readUInt32LE()
    this.ensureBytes(length)

    const str = this.buffer.toString('utf8', this.position, this.position + length)
    this.position += length
    return str
  }

  /**
   * Read optional string (null-safe)
   * Format: [exists:1][length:4?][string:utf8?]
   */
  readOptionalString(): string | undefined {
    const exists = this.readUInt8()
    return exists ? this.readString() : undefined
  }

  /**
   * Read buffer of specified length
   */
  readBuffer(length: number): Buffer {
    this.ensureBytes(length)
    const buffer = this.buffer.subarray(this.position, this.position + length)
    this.position += length
    return buffer
  }

  /**
   * Read JSON object from length-prefixed UTF-8 string
   */
  readJSON<T = unknown>(): T {
    const jsonStr = this.readString()
    try {
      return JSON.parse(jsonStr) as T
    } catch (error) {
      throw new WalDecodeError(`Invalid JSON in WAL entry: ${error}`, this.position)
    }
  }

  /**
   * Read optional JSON object
   */
  readOptionalJSON<T = unknown>(): T | undefined {
    const exists = this.readUInt8()
    return exists ? this.readJSON<T>() : undefined
  }

  /**
   * Skip bytes
   */
  skip(bytes: number): void {
    this.ensureBytes(bytes)
    this.position += bytes
  }
}

/**
 * WAL Entry Binary Decoder
 */
export class WalDecoder {
  /**
   * Decode a WAL entry from binary data
   */
  decode(buffer: Buffer): WalEntry {
    const reader = new BinaryReader(buffer)

    // Read and validate header
    const header = this.decodeHeader(reader)

    // Read and validate payload
    const payloadBuffer = reader.readBuffer(header.payloadSize)
    const calculatedChecksum = CRC32.calculate(payloadBuffer)

    if (calculatedChecksum !== header.checksum) {
      throw new WalDecodeError(
        `Checksum mismatch. Expected ${header.checksum}, got ${calculatedChecksum}`
      )
    }

    // Decode payload based on entry type
    const payload = this.decodePayload(header.type, payloadBuffer, header.version)

    return {
      type: header.type,
      version: header.version,
      timestamp: header.timestamp,
      checksum: header.checksum,
      payloadSize: header.payloadSize,
      ...payload
    } as WalEntry
  }

  /**
   * Decode WAL file header
   */
  decodeFileHeader(buffer: Buffer): WalFileHeader {
    const reader = new BinaryReader(buffer)

    const magic = reader.readUInt32LE()
    if (magic !== WAL_MAGIC_BYTES) {
      throw new WalDecodeError(
        `Invalid WAL file magic bytes. Expected ${WAL_MAGIC_BYTES}, got ${magic}`
      )
    }

    const version = reader.readUInt8()
    reader.skip(1) // Padding
    reader.skip(2) // Reserved
    const created = reader.readTimestamp()
    const nodeId = reader.readString()
    const sessionId = reader.readOptionalString()

    return {
      magic,
      version,
      created,
      nodeId,
      sessionId
    }
  }

  /**
   * Decode multiple entries from batch format
   */
  decodeBatch(buffer: Buffer): WalEntry[] {
    const reader = new BinaryReader(buffer)

    // Read batch header
    const magic = reader.readUInt32LE()
    if (magic !== 0x42415443) {
      // 'BATC'
      throw new WalDecodeError(
        `Invalid batch magic bytes. Expected ${'BATC'}, got ${magic.toString(16)}`
      )
    }

    const entryCount = reader.readUInt32LE()
    const entries: WalEntry[] = []

    for (let i = 0; i < entryCount; i++) {
      const entrySize = reader.readUInt32LE()
      const entryBuffer = reader.readBuffer(entrySize)
      entries.push(this.decode(entryBuffer))
    }

    return entries
  }

  /**
   * Stream decode entries from buffer (for large files)
   */
  *streamDecode(buffer: Buffer): Generator<WalEntry, void, unknown> {
    const reader = new BinaryReader(buffer)

    while (reader.hasData()) {
      try {
        // Peek at header to get entry size
        const headerStart = reader.getPosition()
        const header = this.decodeHeader(reader)

        // Reset position to start of entry
        const entryStart = headerStart
        const entrySize = WAL_HEADER_SIZE + header.payloadSize

        if (reader.remaining() + (reader.getPosition() - headerStart) < entrySize) {
          // Not enough data for complete entry
          break
        }

        // Read complete entry
        reader.skip(entryStart - reader.getPosition()) // Reset to start
        const entryBuffer = reader.readBuffer(entrySize)
        yield this.decode(entryBuffer)
      } catch (error) {
        if (error instanceof WalDecodeError) {
          console.warn(
            `[WalDecoder] Skipping invalid entry at position ${reader.getPosition()}: ${error.message}`
          )
          // Try to find next valid entry by scanning for magic bytes
          if (!this.scanForNextEntry(reader)) {
            break
          }
        } else {
          throw error
        }
      }
    }
  }

  /**
   * Validate entry structure without full decode (for quick scanning)
   */
  validateEntry(buffer: Buffer, offset = 0): {valid: boolean; size?: number; error?: string} {
    try {
      const reader = new BinaryReader(buffer.subarray(offset))
      const header = this.decodeHeader(reader)

      const totalSize = WAL_HEADER_SIZE + header.payloadSize
      if (buffer.length - offset < totalSize) {
        return {valid: false, error: 'Incomplete entry'}
      }

      return {valid: true, size: totalSize}
    } catch (error) {
      return {valid: false, error: error instanceof Error ? error.message : String(error)}
    }
  }

  /**
   * Get decoding statistics
   */
  getDecodingStats(buffer: Buffer): {
    validEntries: number
    invalidEntries: number
    totalSize: number
    errors: string[]
  } {
    const stats = {
      validEntries: 0,
      invalidEntries: 0,
      totalSize: buffer.length,
      errors: [] as string[]
    }

    for (const entry of this.streamDecode(buffer)) {
      try {
        // Entry decoded successfully
        stats.validEntries++
      } catch (error) {
        stats.invalidEntries++
        stats.errors.push(error instanceof Error ? error.message : String(error))
      }
    }

    return stats
  }

  // Private methods

  /**
   * Decode entry header
   */
  private decodeHeader(reader: BinaryReader): WalEntryBase {
    const magic = reader.readUInt32LE()
    if (magic !== WAL_MAGIC_BYTES) {
      throw new WalDecodeError(`Invalid WAL magic bytes. Expected ${WAL_MAGIC_BYTES}, got ${magic}`)
    }

    const version = reader.readUInt8()
    const type = reader.readUInt8() as WalEntryType
    reader.skip(2) // Reserved bytes
    const timestamp = reader.readTimestamp()
    const payloadSize = reader.readUInt32LE()
    const checksum = reader.readUInt32LE()

    return {
      type,
      version,
      timestamp,
      checksum,
      payloadSize
    }
  }

  /**
   * Decode payload based on entry type
   */
  private decodePayload(type: WalEntryType, buffer: Buffer, version: number): Partial<WalEntry> {
    const reader = new BinaryReader(buffer)

    switch (type) {
      case WalEntryType.UTTERANCE_INSERT:
        return {payload: this.decodeUtteranceInsertPayload(reader)}

      case WalEntryType.UTTERANCE_UPDATE:
        return {payload: this.decodeUtteranceUpdatePayload(reader)}

      case WalEntryType.UTTERANCE_DELETE:
        return {payload: this.decodeUtteranceDeletePayload(reader)}

      case WalEntryType.SESSION_CREATE:
        return {payload: this.decodeSessionCreatePayload(reader)}

      case WalEntryType.SESSION_DELETE:
        return {payload: this.decodeSessionDeletePayload(reader)}

      case WalEntryType.CHECKPOINT:
        return {payload: this.decodeCheckpointPayload(reader)}

      case WalEntryType.FLUSH:
        return {payload: this.decodeFlushPayload(reader)}

      case WalEntryType.ROTATION:
        return {payload: this.decodeRotationPayload(reader)}

      case WalEntryType.RECOVERY_START:
        return {payload: this.decodeRecoveryStartPayload(reader)}

      case WalEntryType.RECOVERY_END:
        return {payload: this.decodeRecoveryEndPayload(reader)}

      default:
        throw new WalDecodeError(`Unknown WAL entry type: ${type}`)
    }
  }

  private decodeUtteranceInsertPayload(reader: BinaryReader): WalUtteranceInsert['payload'] {
    const sessionId = reader.readString()
    const utterance = reader.readJSON<TranscriptUtterance>()
    return {sessionId, utterance}
  }

  private decodeUtteranceUpdatePayload(reader: BinaryReader): WalUtteranceUpdate['payload'] {
    const utteranceId = reader.readString()
    const sessionId = reader.readString()
    const updates = reader.readJSON<Partial<TranscriptUtterance>>()

    const hasPreviousState = reader.readUInt8()
    const previousState = hasPreviousState ? (reader.readString() as TranscriptState) : undefined

    return {utteranceId, sessionId, updates, previousState}
  }

  private decodeUtteranceDeletePayload(reader: BinaryReader): WalUtteranceDelete['payload'] {
    const utteranceId = reader.readString()
    const sessionId = reader.readString()
    const reason = reader.readString() as WalUtteranceDelete['payload']['reason']
    return {utteranceId, sessionId, reason}
  }

  private decodeSessionCreatePayload(reader: BinaryReader): WalSessionCreate['payload'] {
    const sessionId = reader.readString()
    const metadata = reader.readOptionalJSON<Record<string, unknown>>()
    return {sessionId, metadata}
  }

  private decodeSessionDeletePayload(reader: BinaryReader): WalSessionDelete['payload'] {
    const sessionId = reader.readString()
    const utteranceCount = reader.readUInt32LE()
    const reason = reader.readString() as WalSessionDelete['payload']['reason']
    return {sessionId, utteranceCount, reason}
  }

  private decodeCheckpointPayload(reader: BinaryReader): WalCheckpoint['payload'] {
    const sequenceNumber = reader.readUInt32LE()
    const utteranceCount = reader.readUInt32LE()
    const sessionCount = reader.readUInt32LE()
    return {sequenceNumber, utteranceCount, sessionCount}
  }

  private decodeFlushPayload(reader: BinaryReader): WalFlush['payload'] {
    const reason = reader.readString() as WalFlush['payload']['reason']
    const entriesFlushed = reader.readUInt32LE()
    return {reason, entriesFlushed}
  }

  private decodeRotationPayload(reader: BinaryReader): WalRotation['payload'] {
    const oldFileName = reader.readString()
    const newFileName = reader.readString()
    const reason = reader.readString() as WalRotation['payload']['reason']
    return {oldFileName, newFileName, reason}
  }

  private decodeRecoveryStartPayload(reader: BinaryReader): WalRecoveryStart['payload'] {
    const recoveryId = reader.readString()
    const startTime = reader.readTimestamp()

    const fileCount = reader.readUInt32LE()
    const walFiles: string[] = []
    for (let i = 0; i < fileCount; i++) {
      walFiles.push(reader.readString())
    }

    return {recoveryId, startTime, walFiles}
  }

  private decodeRecoveryEndPayload(reader: BinaryReader): WalRecoveryEnd['payload'] {
    const recoveryId = reader.readString()
    const endTime = reader.readTimestamp()
    const recoveredEntries = reader.readUInt32LE()
    const success = reader.readUInt8() === 1
    return {recoveryId, endTime, recoveredEntries, success}
  }

  /**
   * Scan for next valid entry (recovery from corruption)
   */
  private scanForNextEntry(reader: BinaryReader): boolean {
    const magicBytes = Buffer.from([
      WAL_MAGIC_BYTES & 0xff,
      (WAL_MAGIC_BYTES >>> 8) & 0xff,
      (WAL_MAGIC_BYTES >>> 16) & 0xff,
      (WAL_MAGIC_BYTES >>> 24) & 0xff
    ])

    while (reader.hasData()) {
      const currentPos = reader.getPosition()
      if (reader.remaining() < WAL_HEADER_SIZE) {
        break
      }

      const nextBytes = reader.readBuffer(4)
      if (nextBytes.equals(magicBytes)) {
        // Found potential magic bytes, reset to start of magic
        reader.skip(currentPos - reader.getPosition() + 4) // Reset to after magic
        return true
      } else {
        // Move one byte forward and try again
        reader.skip(currentPos - reader.getPosition() + 1)
      }
    }

    return false
  }
}

/**
 * Global decoder instance for convenience
 */
export const globalWalDecoder = new WalDecoder()

export default WalDecoder

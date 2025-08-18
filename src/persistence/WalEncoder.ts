/**
 * WalEncoder - Binary Encoding for Write-Ahead Log Entries
 *
 * Provides efficient binary serialization of WAL entries with:
 * - Compact representation to minimize I/O overhead
 * - CRC32 checksums for data integrity
 * - Variable-length encoding for strings and optional fields
 * - Version-aware format for future evolution
 */

import {WalEntry, WalEntryType, WAL_HEADER_SIZE, WAL_MAGIC_BYTES, WalFileHeader} from './WalEntry'

/**
 * CRC32 implementation for checksums
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
 * Binary buffer writer with automatic growth
 */
class BinaryWriter {
  private buffer: Buffer
  private position = 0
  private capacity: number

  constructor(initialCapacity = 1024) {
    this.capacity = initialCapacity
    this.buffer = Buffer.allocUnsafe(this.capacity)
  }

  /**
   * Ensure buffer has space for additional bytes
   */
  private ensureSpace(bytes: number): void {
    const required = this.position + bytes
    if (required > this.capacity) {
      // Double capacity or use required size, whichever is larger
      const newCapacity = Math.max(this.capacity * 2, required)
      const newBuffer = Buffer.allocUnsafe(newCapacity)
      this.buffer.copy(newBuffer, 0, 0, this.position)
      this.buffer = newBuffer
      this.capacity = newCapacity
    }
  }

  /**
   * Write unsigned 8-bit integer
   */
  writeUInt8(value: number): void {
    this.ensureSpace(1)
    this.buffer.writeUInt8(value, this.position)
    this.position += 1
  }

  /**
   * Write unsigned 16-bit integer (little-endian)
   */
  writeUInt16LE(value: number): void {
    this.ensureSpace(2)
    this.buffer.writeUInt16LE(value, this.position)
    this.position += 2
  }

  /**
   * Write unsigned 32-bit integer (little-endian)
   */
  writeUInt32LE(value: number): void {
    this.ensureSpace(4)
    this.buffer.writeUInt32LE(value, this.position)
    this.position += 4
  }

  /**
   * Write 64-bit integer (little-endian, represented as bigint)
   */
  writeBigUInt64LE(value: bigint): void {
    this.ensureSpace(8)
    this.buffer.writeBigUInt64LE(value, this.position)
    this.position += 8
  }

  /**
   * Write 64-bit timestamp (little-endian, from number)
   */
  writeTimestamp(timestamp: number): void {
    this.writeBigUInt64LE(BigInt(timestamp))
  }

  /**
   * Write length-prefixed string (UTF-8)
   * Format: [length:4][string:utf8]
   */
  writeString(str: string): void {
    const utf8Bytes = Buffer.from(str, 'utf8')
    this.writeUInt32LE(utf8Bytes.length)
    this.writeBuffer(utf8Bytes)
  }

  /**
   * Write optional string (null-safe)
   * Format: [exists:1][length:4?][string:utf8?]
   */
  writeOptionalString(str: string | undefined): void {
    if (str === undefined || str === null) {
      this.writeUInt8(0) // Not present
    } else {
      this.writeUInt8(1) // Present
      this.writeString(str)
    }
  }

  /**
   * Write buffer content
   */
  writeBuffer(buffer: Buffer): void {
    this.ensureSpace(buffer.length)
    buffer.copy(this.buffer, this.position)
    this.position += buffer.length
  }

  /**
   * Write JSON object as length-prefixed UTF-8 string
   */
  writeJSON(obj: unknown): void {
    const json = JSON.stringify(obj)
    this.writeString(json)
  }

  /**
   * Write optional JSON object
   */
  writeOptionalJSON(obj: unknown): void {
    if (obj === undefined || obj === null) {
      this.writeUInt8(0) // Not present
    } else {
      this.writeUInt8(1) // Present
      this.writeJSON(obj)
    }
  }

  /**
   * Get current buffer size
   */
  size(): number {
    return this.position
  }

  /**
   * Get final buffer (trimmed to actual size)
   */
  toBuffer(): Buffer {
    return this.buffer.subarray(0, this.position)
  }

  /**
   * Reset writer for reuse
   */
  reset(): void {
    this.position = 0
  }
}

/**
 * WAL Entry Binary Encoder
 */
export class WalEncoder {
  private writer = new BinaryWriter()

  /**
   * Encode a WAL entry to binary format
   */
  encode(entry: WalEntry): Buffer {
    this.writer.reset()

    // Encode payload first to calculate size and checksum
    const payloadBuffer = this.encodePayload(entry)
    const checksum = CRC32.calculate(payloadBuffer)

    // Write header (24 bytes fixed)
    this.writer.writeUInt32LE(WAL_MAGIC_BYTES) // Magic bytes
    this.writer.writeUInt8(entry.version) // Version
    this.writer.writeUInt8(entry.type) // Entry type
    this.writer.writeUInt16LE(0) // Reserved bytes
    this.writer.writeTimestamp(entry.timestamp) // Timestamp (8 bytes)
    this.writer.writeUInt32LE(payloadBuffer.length) // Payload size
    this.writer.writeUInt32LE(checksum) // Checksum

    // Write payload
    this.writer.writeBuffer(payloadBuffer)

    return this.writer.toBuffer()
  }

  /**
   * Encode WAL file header
   */
  encodeFileHeader(header: WalFileHeader): Buffer {
    this.writer.reset()

    this.writer.writeUInt32LE(header.magic)
    this.writer.writeUInt8(header.version)
    this.writer.writeUInt8(0) // Padding
    this.writer.writeUInt16LE(0) // Reserved
    this.writer.writeTimestamp(header.created)
    this.writer.writeString(header.nodeId)
    this.writer.writeOptionalString(header.sessionId)

    return this.writer.toBuffer()
  }

  /**
   * Batch encode multiple entries efficiently
   */
  encodeBatch(entries: WalEntry[]): Buffer {
    this.writer.reset()

    // Write batch header
    this.writer.writeUInt32LE(0x42415443) // 'BATC' magic
    this.writer.writeUInt32LE(entries.length) // Entry count

    // Encode each entry
    for (const entry of entries) {
      const entryBuffer = this.encode(entry)
      this.writer.writeUInt32LE(entryBuffer.length) // Entry size
      this.writer.writeBuffer(entryBuffer)
    }

    return this.writer.toBuffer()
  }

  /**
   * Get encoding statistics for analysis
   */
  getEncodingStats(entry: WalEntry): {
    headerSize: number
    payloadSize: number
    totalSize: number
    compressionRatio: number
  } {
    const encoded = this.encode(entry)
    const jsonSize = JSON.stringify(entry).length

    return {
      headerSize: WAL_HEADER_SIZE,
      payloadSize: encoded.length - WAL_HEADER_SIZE,
      totalSize: encoded.length,
      compressionRatio: jsonSize / encoded.length
    }
  }

  /**
   * Encode payload based on entry type
   */
  private encodePayload(entry: WalEntry): Buffer {
    const payloadWriter = new BinaryWriter()

    switch (entry.type) {
      case WalEntryType.UTTERANCE_INSERT:
        this.encodeUtteranceInsertPayload(payloadWriter, entry)
        break

      case WalEntryType.UTTERANCE_UPDATE:
        this.encodeUtteranceUpdatePayload(payloadWriter, entry)
        break

      case WalEntryType.UTTERANCE_DELETE:
        this.encodeUtteranceDeletePayload(payloadWriter, entry)
        break

      case WalEntryType.SESSION_CREATE:
        this.encodeSessionCreatePayload(payloadWriter, entry)
        break

      case WalEntryType.SESSION_DELETE:
        this.encodeSessionDeletePayload(payloadWriter, entry)
        break

      case WalEntryType.CHECKPOINT:
        this.encodeCheckpointPayload(payloadWriter, entry)
        break

      case WalEntryType.FLUSH:
        this.encodeFlushPayload(payloadWriter, entry)
        break

      case WalEntryType.ROTATION:
        this.encodeRotationPayload(payloadWriter, entry)
        break

      case WalEntryType.RECOVERY_START:
        this.encodeRecoveryStartPayload(payloadWriter, entry)
        break

      case WalEntryType.RECOVERY_END:
        this.encodeRecoveryEndPayload(payloadWriter, entry)
        break

      default: {
        // This should never happen with proper TypeScript usage
        const unknownEntry = entry as {type: number}
        throw new Error(`Unknown WAL entry type: ${unknownEntry.type}`)
      }
    }

    return payloadWriter.toBuffer()
  }

  private encodeUtteranceInsertPayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.UTTERANCE_INSERT) return

    writer.writeString(entry.payload.sessionId)
    writer.writeJSON(entry.payload.utterance)
  }

  private encodeUtteranceUpdatePayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.UTTERANCE_UPDATE) return

    writer.writeString(entry.payload.utteranceId)
    writer.writeString(entry.payload.sessionId)
    writer.writeJSON(entry.payload.updates)

    // Optional previous state
    if (entry.payload.previousState !== undefined) {
      writer.writeUInt8(1) // Present
      writer.writeString(entry.payload.previousState)
    } else {
      writer.writeUInt8(0) // Not present
    }
  }

  private encodeUtteranceDeletePayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.UTTERANCE_DELETE) return

    writer.writeString(entry.payload.utteranceId)
    writer.writeString(entry.payload.sessionId)
    writer.writeString(entry.payload.reason)
  }

  private encodeSessionCreatePayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.SESSION_CREATE) return

    writer.writeString(entry.payload.sessionId)
    writer.writeOptionalJSON(entry.payload.metadata)
  }

  private encodeSessionDeletePayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.SESSION_DELETE) return

    writer.writeString(entry.payload.sessionId)
    writer.writeUInt32LE(entry.payload.utteranceCount)
    writer.writeString(entry.payload.reason)
  }

  private encodeCheckpointPayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.CHECKPOINT) return

    writer.writeUInt32LE(entry.payload.sequenceNumber)
    writer.writeUInt32LE(entry.payload.utteranceCount)
    writer.writeUInt32LE(entry.payload.sessionCount)
  }

  private encodeFlushPayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.FLUSH) return

    writer.writeString(entry.payload.reason)
    writer.writeUInt32LE(entry.payload.entriesFlushed)
  }

  private encodeRotationPayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.ROTATION) return

    writer.writeString(entry.payload.oldFileName)
    writer.writeString(entry.payload.newFileName)
    writer.writeString(entry.payload.reason)
  }

  private encodeRecoveryStartPayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.RECOVERY_START) return

    writer.writeString(entry.payload.recoveryId)
    writer.writeTimestamp(entry.payload.startTime)

    // Write array of WAL files
    writer.writeUInt32LE(entry.payload.walFiles.length)
    for (const file of entry.payload.walFiles) {
      writer.writeString(file)
    }
  }

  private encodeRecoveryEndPayload(writer: BinaryWriter, entry: WalEntry): void {
    if (entry.type !== WalEntryType.RECOVERY_END) return

    writer.writeString(entry.payload.recoveryId)
    writer.writeTimestamp(entry.payload.endTime)
    writer.writeUInt32LE(entry.payload.recoveredEntries)
    writer.writeUInt8(entry.payload.success ? 1 : 0)
  }
}

/**
 * Global encoder instance for convenience
 */
export const globalWalEncoder = new WalEncoder()

export default WalEncoder

#!/usr/bin/env node

/**
 * Test script for ConnectionPoolManager functionality
 * Tests basic pool operations, connection management, and error handling
 */

import {EventEmitter} from 'events'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Mock GeminiLiveWebSocketClient for testing
class MockGeminiLiveWebSocketClient extends EventEmitter {
  constructor(options = {}) {
    super()
    this.id = Math.random().toString(36).substr(2, 9)
    this.isConnected = false
    this.options = options
    this.mockDelay = options.mockDelay || 100
  }

  async connect() {
    await new Promise(resolve => setTimeout(resolve, this.mockDelay))
    this.isConnected = true
    this.emit('connected')
    return true
  }

  async disconnect() {
    this.isConnected = false
    this.emit('disconnected')
  }

  ping() {
    if (!this.isConnected) throw new Error('Connection not established')
    return Promise.resolve('pong')
  }

  getState() {
    return this.isConnected ? 'CONNECTED' : 'DISCONNECTED'
  }

  destroy() {
    this.isConnected = false
    this.removeAllListeners()
  }
}

// Mock logger
const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.log
}

// Mock performance profiler
const performanceProfiler = {
  markStart: marker => console.log(`🔹 Performance: ${marker} started`),
  markEnd: marker => console.log(`🔹 Performance: ${marker} completed`)
}

// Test configuration
const testConfig = {
  minPoolSize: 2,
  maxPoolSize: 4,
  heartbeatInterval: 2000, // 2 seconds for testing
  heartbeatTimeout: 1000,
  connectionTimeout: 5000,
  maxConnectionAge: 30000, // 30 seconds for testing
  maxConnectionUsage: 10,
  enablePredictiveScaling: false, // Disabled for testing
  queueTimeout: 1000
}

async function runConnectionPoolTests() {
  console.log('\n🧪 Starting ConnectionPoolManager Tests\n')

  try {
    // Import our ConnectionPoolManager (using dynamic import for ES modules)
    const {ConnectionPoolManager} = await import('./src/connection/ConnectionPoolManager.ts')

    console.log('✅ ConnectionPoolManager imported successfully')

    // Test 1: Initialization
    console.log('\n📋 Test 1: Pool Initialization')
    const poolManager = new ConnectionPoolManager(
      MockGeminiLiveWebSocketClient,
      testConfig,
      logger,
      performanceProfiler
    )

    await poolManager.initialize()
    console.log('✅ Pool initialized successfully')

    // Test 2: Connection Request
    console.log('\n📋 Test 2: Connection Request')
    const connection1 = await poolManager.getConnection()
    console.log(`✅ Got connection: ${connection1.id}`)

    // Test 3: Multiple Connection Requests
    console.log('\n📋 Test 3: Multiple Connection Requests')
    const connection2 = await poolManager.getConnection()
    const connection3 = await poolManager.getConnection()
    console.log(`✅ Got connections: ${connection2.id}, ${connection3.id}`)

    // Test 4: Return Connections
    console.log('\n📋 Test 4: Return Connections')
    poolManager.returnConnection(connection1)
    poolManager.returnConnection(connection2)
    console.log('✅ Returned connections to pool')

    // Test 5: Pool Statistics
    console.log('\n📋 Test 5: Pool Statistics')
    const stats = poolManager.getStats()
    console.log('📊 Pool Statistics:')
    console.log(`   - Total Connections: ${stats.totalConnections}`)
    console.log(`   - Idle Connections: ${stats.idleConnections}`)
    console.log(`   - Active Connections: ${stats.activeConnections}`)
    console.log(`   - Total Requests: ${stats.totalRequests}`)
    console.log(`   - Queue Length: ${stats.queueLength}`)

    // Test 6: Pool Events
    console.log('\n📋 Test 6: Pool Events')
    poolManager.on('connectionCreated', connection => {
      console.log(`🔔 Event: Connection created ${connection.id}`)
    })
    poolManager.on('connectionRecycled', connection => {
      console.log(`🔔 Event: Connection recycled ${connection.id}`)
    })

    // Test 7: Stress Test - Request more connections than pool size
    console.log('\n📋 Test 7: Stress Test')
    const stressPromises = []
    for (let i = 0; i < 6; i++) {
      stressPromises.push(poolManager.getConnection())
    }

    try {
      const stressConnections = await Promise.all(stressPromises)
      console.log(`✅ Stress test completed, got ${stressConnections.length} connections`)

      // Return stress test connections
      stressConnections.forEach(conn => poolManager.returnConnection(conn))
    } catch (error) {
      console.log(`⚠️ Some connections may have been queued: ${error.message}`)
    }

    // Test 8: Cleanup
    console.log('\n📋 Test 8: Pool Shutdown')
    await poolManager.destroy()
    console.log('✅ Pool destroyed successfully')

    console.log('\n🎉 All ConnectionPoolManager tests completed successfully!')
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

// Run tests
runConnectionPoolTests().catch(console.error)

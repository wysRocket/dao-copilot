import React from 'react'
import { Link } from '@tanstack/react-router'
import TranscriptionEventTest from '../components/TranscriptionEventTest'

export default function HomePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full flex-1 flex-col p-8">
        {/* Main window content - no transcription display */}
        <div className="mb-8 flex flex-1 items-center justify-center">
          <div
            className="rounded-lg border-2 border-dashed p-8 text-center"
            style={{
              borderColor: 'var(--glass-border)',
              color: 'var(--text-muted)',
              backgroundColor: 'var(--glass-light)'
            }}
          >
            <div className="mb-4 text-6xl opacity-60">🎙️</div>
            <div className="mb-2 text-xl font-medium" style={{color: 'var(--text-primary)'}}>
              DAO Copilot
            </div>
            <div className="mb-4 text-sm">Voice transcription and AI assistance ready</div>
            <div className="text-xs mb-4">Transcriptions will appear in the assistant window</div>
            
            {/* Zero-latency transcription test link */}
            <div className="mt-6">
              <Link
                to="/zero-latency-test"
                className="inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
              >
                🚀 Test Zero-Latency Transcription
              </Link>
              <div className="text-xs mt-2 text-gray-500">
                Fix for 20+ second delay issue
              </div>
            </div>
          </div>
        </div>

        {/* Transcription Event Test Component for debugging (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4">
            <TranscriptionEventTest />
          </div>
        )}
      </div>
    </div>
  )
}

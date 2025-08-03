import React from 'react'
import AudioDebugDashboard from '../../components/AudioDebugDashboard'

const AudioDebugPage: React.FC = () => {
  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--background-primary)' }}>
      <div className="max-w-4xl mx-auto">
        <AudioDebugDashboard />
      </div>
    </div>
  )
}

export default AudioDebugPage

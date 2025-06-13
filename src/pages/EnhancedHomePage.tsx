"use client"

import type React from "react"
import { useState } from "react"
import { GlassWindowLayout } from "../layouts/GlassWindowLayout"
import { GlassCard } from "../components/ui/glass-card"
import { GlassButton } from "../components/ui/glass-button"
import { GlassInput } from "../components/ui/glass-input"
import { GlassModal } from "../components/ui/glass-modal"
import { Mic, MicOff, Settings, Play, Square } from "lucide-react"

export const EnhancedHomePage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const navigationItems = [
    { label: "Home", active: true },
    { label: "Transcripts", active: false },
    { label: "Analysis", active: false },
    { label: "Settings", active: false },
  ]

  const sidebarContent = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>

      <GlassCard variant="subtle" className="p-4">
        <h4 className="text-white font-medium mb-2">Recording Status</h4>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isRecording ? "bg-red-400" : "bg-gray-400"}`} />
          <span className="text-white/70 text-sm">{isRecording ? "Recording..." : "Stopped"}</span>
        </div>
      </GlassCard>

      <GlassCard variant="subtle" className="p-4">
        <h4 className="text-white font-medium mb-2">Recent Sessions</h4>
        <div className="space-y-2">
          <div className="text-white/60 text-sm">Meeting - 2 hours ago</div>
          <div className="text-white/60 text-sm">Call - 1 day ago</div>
          <div className="text-white/60 text-sm">Interview - 2 days ago</div>
        </div>
      </GlassCard>
    </div>
  )

  return (
    <GlassWindowLayout showSidebar={true} sidebarContent={sidebarContent} navigationItems={navigationItems}>
      <div className="h-full flex flex-col space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">DAO Copilot</h1>
          <p className="text-white/70">Enhanced with Glass Morphism UI</p>
        </div>

        {/* Search */}
        <div className="max-w-md mx-auto w-full">
          <GlassInput
            placeholder="Search transcripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Main Controls */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-8">
          <GlassCard variant="strong" className="text-center max-w-md">
            <div className="space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                {isRecording ? <Mic className="w-8 h-8 text-white" /> : <MicOff className="w-8 h-8 text-white" />}
              </div>

              <h2 className="text-xl font-semibold text-white">
                {isRecording ? "Recording in Progress" : "Ready to Record"}
              </h2>

              <p className="text-white/70">
                {isRecording
                  ? "Click stop when you're finished recording"
                  : "Click start to begin recording your session"}
              </p>
            </div>
          </GlassCard>

          {/* Control Buttons */}
          <div className="flex space-x-4">
            <GlassButton variant="primary" size="lg" onClick={() => setIsRecording(!isRecording)}>
              {isRecording ? (
                <>
                  <Square className="w-5 h-5 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Start Recording
                </>
              )}
            </GlassButton>

            <GlassButton variant="secondary" size="lg" onClick={() => setShowModal(true)}>
              <Settings className="w-5 h-5 mr-2" />
              Settings
            </GlassButton>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 w-full max-w-lg">
            <GlassCard variant="subtle" className="text-center p-4">
              <div className="text-2xl font-bold text-white">24</div>
              <div className="text-white/60 text-sm">Sessions</div>
            </GlassCard>

            <GlassCard variant="subtle" className="text-center p-4">
              <div className="text-2xl font-bold text-white">12h</div>
              <div className="text-white/60 text-sm">Total Time</div>
            </GlassCard>

            <GlassCard variant="subtle" className="text-center p-4">
              <div className="text-2xl font-bold text-white">98%</div>
              <div className="text-white/60 text-sm">Accuracy</div>
            </GlassCard>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <GlassModal isOpen={showModal} onClose={() => setShowModal(false)} title="Settings" size="md">
        <div className="space-y-4">
          <GlassInput label="Recording Quality" placeholder="High Quality" />

          <GlassInput label="Auto-save Location" placeholder="/Documents/Recordings" />

          <div className="flex justify-end space-x-3 mt-6">
            <GlassButton variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </GlassButton>
            <GlassButton variant="primary" onClick={() => setShowModal(false)}>
              Save Changes
            </GlassButton>
          </div>
        </div>
      </GlassModal>
    </GlassWindowLayout>
  )
}

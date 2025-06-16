"use client"

import type React from "react"
import { useState } from "react"
import { GlassWindowLayout } from "../layouts/GlassWindowLayout"
import { GlassCard } from "../components/ui/glass-card"
import { GlassButton } from "../components/ui/glass-button"
import { GlassInput } from "../components/ui/glass-input"
import { GlassModal } from "../components/ui/glass-modal"
import { GlassTooltip } from "../components/ui/glass-tooltip"
import { GlassDropdown } from "../components/ui/glass-dropdown"
import { GlassTabs } from "../components/ui/glass-tabs"
import { GlassProgress } from "../components/ui/glass-progress"
import { GlassNotification } from "../components/ui/glass-notification"
import { Settings, User, Home, BarChart3, Palette, Zap, Heart } from "lucide-react"

export const GlassComponentsShowcase: React.FC = () => {
  const [showModal, setShowModal] = useState(false)
  const [selectedDropdown, setSelectedDropdown] = useState("")
  const [progress, setProgress] = useState(65)
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "warning" | "info"
    title: string
    message: string
    visible: boolean
  }>({
    type: "info",
    title: "",
    message: "",
    visible: false,
  })

  const dropdownOptions = [
    { value: "option1", label: "Dashboard", icon: <Home className="w-4 h-4" /> },
    { value: "option2", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
    { value: "option3", label: "Settings", icon: <Settings className="w-4 h-4" /> },
    { value: "option4", label: "Profile", icon: <User className="w-4 h-4" /> },
  ]

  const tabsData = [
    {
      id: "components",
      label: "Components",
      icon: <Palette className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Glass Components</h3>
          <p className="text-white/70">
            Explore our collection of beautiful glass morphism components built with liquid-glass-react.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <GlassCard variant="subtle" className="p-4">
              <h4 className="font-medium text-white mb-2">Buttons</h4>
              <div className="space-y-2">
                <GlassButton variant="primary" size="sm">
                  Primary
                </GlassButton>
                <GlassButton variant="secondary" size="sm">
                  Secondary
                </GlassButton>
              </div>
            </GlassCard>
            <GlassCard variant="subtle" className="p-4">
              <h4 className="font-medium text-white mb-2">Inputs</h4>
              <GlassInput placeholder="Glass input field" />
            </GlassCard>
          </div>
        </div>
      ),
    },
    {
      id: "features",
      label: "Features",
      icon: <Zap className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Advanced Features</h3>
          <ul className="space-y-2 text-white/70">
            <li>• Interactive glass morphism effects</li>
            <li>• Customizable blur and distortion</li>
            <li>• Responsive design support</li>
            <li>• Accessibility compliant</li>
            <li>• TypeScript support</li>
          </ul>
        </div>
      ),
    },
    {
      id: "about",
      label: "About",
      icon: <Heart className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">About This Integration</h3>
          <p className="text-white/70">
            This showcase demonstrates the integration of @rdev/liquid-glass-react into the DAO Copilot application,
            providing modern glass morphism effects that enhance the user experience.
          </p>
        </div>
      ),
    },
  ]

  const showNotification = (type: "success" | "error" | "warning" | "info") => {
    const messages = {
      success: { title: "Success!", message: "Operation completed successfully." },
      error: { title: "Error!", message: "Something went wrong. Please try again." },
      warning: { title: "Warning!", message: "Please review your input before proceeding." },
      info: { title: "Information", message: "Here is some helpful information." },
    }

    setNotification({
      type,
      ...messages[type],
      visible: true,
    })
  }

  const navigationItems = [
    { label: "Showcase", active: true },
    { label: "Components", active: false },
    { label: "Documentation", active: false },
  ]

  const sidebarContent = (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Component Library</h3>

      <GlassCard variant="minimal" className="p-3">
        <h4 className="font-medium text-white mb-2">Basic Components</h4>
        <ul className="space-y-1 text-sm text-white/70">
          <li>• Glass Cards</li>
          <li>• Glass Buttons</li>
          <li>• Glass Inputs</li>
          <li>• Glass Modals</li>
        </ul>
      </GlassCard>

      <GlassCard variant="minimal" className="p-3">
        <h4 className="font-medium text-white mb-2">Advanced Components</h4>
        <ul className="space-y-1 text-sm text-white/70">
          <li>• Glass Tooltips</li>
          <li>• Glass Dropdowns</li>
          <li>• Glass Tabs</li>
          <li>• Glass Progress</li>
          <li>• Glass Notifications</li>
        </ul>
      </GlassCard>
    </div>
  )

  return (
    <GlassWindowLayout
      showSidebar={true}
      sidebarContent={sidebarContent}
      navigationItems={navigationItems}
      titleBarVariant="assistant"
      backgroundVariant="gradient"
    >
      <div className="h-full overflow-y-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Glass Components Showcase</h1>
          <p className="text-white/70">Demonstrating @rdev/liquid-glass-react integration</p>
        </div>

        {/* Button Showcase */}
        <GlassCard variant="default">
          <h2 className="text-xl font-semibold text-white mb-4">Interactive Buttons</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GlassTooltip content="Primary action button">
              <GlassButton variant="primary" className="w-full">
                Primary
              </GlassButton>
            </GlassTooltip>

            <GlassTooltip content="Secondary action button">
              <GlassButton variant="secondary" className="w-full">
                Secondary
              </GlassButton>
            </GlassTooltip>

            <GlassTooltip content="Destructive action button">
              <GlassButton variant="destructive" className="w-full">
                Destructive
              </GlassButton>
            </GlassTooltip>

            <GlassTooltip content="Ghost style button">
              <GlassButton variant="ghost" className="w-full">
                Ghost
              </GlassButton>
            </GlassTooltip>
          </div>
        </GlassCard>

        {/* Form Components */}
        <GlassCard variant="default">
          <h2 className="text-xl font-semibold text-white mb-4">Form Components</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <GlassInput label="Glass Input" placeholder="Enter your text here..." variant="default" />

              <GlassDropdown
                options={dropdownOptions}
                value={selectedDropdown}
                onChange={setSelectedDropdown}
                placeholder="Select an option"
              />
            </div>

            <div className="space-y-4">
              <GlassInput label="Prominent Input" placeholder="Prominent variant..." variant="prominent" />

              <GlassInput label="Subtle Input" placeholder="Subtle variant..." variant="subtle" />
            </div>
          </div>
        </GlassCard>

        {/* Progress and Notifications */}
        <GlassCard variant="default">
          <h2 className="text-xl font-semibold text-white mb-4">Progress & Notifications</h2>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-white">Progress Indicators</h3>
                <div className="space-x-2">
                  <GlassButton size="sm" onClick={() => setProgress(Math.max(0, progress - 10))}>
                    -10%
                  </GlassButton>
                  <GlassButton size="sm" onClick={() => setProgress(Math.min(100, progress + 10))}>
                    +10%
                  </GlassButton>
                </div>
              </div>

              <div className="space-y-4">
                <GlassProgress value={progress} showLabel variant="default" />
                <GlassProgress value={85} showLabel variant="success" />
                <GlassProgress value={45} showLabel variant="warning" />
                <GlassProgress value={25} showLabel variant="error" />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-white mb-4">Notifications</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <GlassButton size="sm" onClick={() => showNotification("success")}>
                  Success
                </GlassButton>
                <GlassButton size="sm" onClick={() => showNotification("error")}>
                  Error
                </GlassButton>
                <GlassButton size="sm" onClick={() => showNotification("warning")}>
                  Warning
                </GlassButton>
                <GlassButton size="sm" onClick={() => showNotification("info")}>
                  Info
                </GlassButton>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Tabs Showcase */}
        <GlassCard variant="default">
          <h2 className="text-xl font-semibold text-white mb-4">Tabbed Interface</h2>
          <GlassTabs tabs={tabsData} defaultTab="components" />
        </GlassCard>

        {/* Modal Trigger */}
        <GlassCard variant="default" className="text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Modal Dialog</h2>
          <GlassButton variant="primary" onClick={() => setShowModal(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Open Glass Modal
          </GlassButton>
        </GlassCard>
      </div>

      {/* Modal */}
      <GlassModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Glass Modal Example"
        size="lg"
        variant="prominent"
      >
        <div className="space-y-4">
          <p className="text-white/80">
            This is an example of a glass morphism modal dialog. It features beautiful blur effects and interactive
            elements that respond to user interaction.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlassInput placeholder="Modal input field" />
            <GlassDropdown options={dropdownOptions} placeholder="Select option" />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <GlassButton variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </GlassButton>
            <GlassButton variant="primary" onClick={() => setShowModal(false)}>
              Save Changes
            </GlassButton>
          </div>
        </div>
      </GlassModal>

      {/* Notification */}
      <GlassNotification
        type={notification.type}
        title={notification.title}
        message={notification.message}
        isVisible={notification.visible}
        onClose={() => setNotification((prev) => ({ ...prev, visible: false }))}
      />
    </GlassWindowLayout>
  )
}

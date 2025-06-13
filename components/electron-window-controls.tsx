"use client"

import { X, Minus, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ElectronWindowControlsProps {
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
}

export function ElectronWindowControls({ onMinimize, onMaximize, onClose }: ElectronWindowControlsProps) {
  // In a real Electron app, these would call the Electron API
  const handleMinimize = () => {
    if (onMinimize) onMinimize()
    // In actual Electron: window.electron.minimize()
    console.log("Minimize window")
  }

  const handleMaximize = () => {
    if (onMaximize) onMaximize()
    // In actual Electron: window.electron.maximize()
    console.log("Maximize window")
  }

  const handleClose = () => {
    if (onClose) onClose()
    // In actual Electron: window.electron.close()
    console.log("Close window")
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-yellow-200" onClick={handleMinimize}>
        <Minus className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-green-200" onClick={handleMaximize}>
        <Square className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-red-200" onClick={handleClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

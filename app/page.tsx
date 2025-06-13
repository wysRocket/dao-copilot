"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Mic, Settings, Eye, EyeOff, Sparkles, Maximize2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export default function ClueyApp() {
  const [isVisible, setIsVisible] = useState(true)
  const [timer, setTimer] = useState("00:00")

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <div className="p-2 bg-blue-50 rounded-lg m-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
              <Mic className="w-3 h-3" />
            </div>
            <span className="text-sm text-gray-500">{timer}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-500 h-8">
              Ask AI
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500"
                    onClick={() => setIsVisible(!isVisible)}
                  >
                    {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isVisible ? "Hide" : "Show"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Separator orientation="vertical" className="h-5" />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isVisible && (
        <Card className="m-2 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-2 mb-4">
              <div className="bg-gray-100 rounded-full p-1 mt-1">
                <Sparkles className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  I can see you're currently viewing the Cluely website homepage. The AI assistant that monitors your
                  screen and audio to provide contextual help before you even ask for it.
                </p>

                <h2 className="text-lg font-medium mb-2">What is Cluely?</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Cluely is a proactive AI assistant. Unlike traditional AI chatbots where you need to actively ask
                  questions, Cluely runs in the background, continuously observing your screen content and listening to
                  your audio to provide relevant assistance in real-time.
                </p>

                <h3 className="text-sm font-medium mb-2">Features:</h3>
                <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 pl-1">
                  <li>
                    <span className="font-medium">Screen monitoring:</span> Cluely can see what's on your screen and
                    understand the context
                  </li>
                  <li>
                    <span className="font-medium">Audio listening:</span> It processes your calls and conversations
                  </li>
                  <li>
                    <span className="font-medium">Proactive assistance:</span> Rather than waiting for questions, it
                    anticipates what you might need
                  </li>
                  <li>
                    <span className="font-medium">Completely undetectable:</span> Cluely is invisible to others, follows
                    you everywhere
                  </li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

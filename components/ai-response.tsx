import type React from "react"
import { Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface AIResponseProps {
  content: React.ReactNode
}

export function AIResponse({ content }: AIResponseProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <div className="bg-gray-100 rounded-full p-1 mt-1">
            <Sparkles className="h-4 w-4 text-gray-500" />
          </div>
          <div className="text-sm text-gray-600">{content}</div>
        </div>
      </CardContent>
    </Card>
  )
}

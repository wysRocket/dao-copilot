import React from 'react'
import AssistantWindowLayout from '@/layouts/AssistantWindowLayout'
import {Outlet, createRootRoute} from '@tanstack/react-router'
import {AnswerDisplayProvider} from '../contexts/AnswerDisplayProvider'

export const AssistantRootRoute = createRootRoute({
  component: AssistantRoot
})

function AssistantRoot() {
  return (
    <AnswerDisplayProvider
      defaultConfig={{
        enableDebugLogging: process.env.NODE_ENV === 'development',
        showSearchProgress: true,
        enableTypewriterEffect: true,
        typewriterSpeed: 30
      }}
    >
      <AssistantWindowLayout>
        <Outlet />
      </AssistantWindowLayout>
    </AnswerDisplayProvider>
  )
}

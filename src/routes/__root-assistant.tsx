import React from 'react'
import AssistantWindowLayout from '@/layouts/AssistantWindowLayout'
import {Outlet, createRootRoute} from '@tanstack/react-router'

export const AssistantRootRoute = createRootRoute({
  component: AssistantRoot
})

function AssistantRoot() {
  return (
    <AssistantWindowLayout>
      <Outlet />
    </AssistantWindowLayout>
  )
}

import React from 'react'
import WindowLayout from '@/layouts/WindowLayout'
import {Outlet, createRootRoute} from '@tanstack/react-router'

export const RootRoute = createRootRoute({
  component: Root
})

function Root() {
  return (
    <WindowLayout>
      <Outlet />
    </WindowLayout>
  )
}

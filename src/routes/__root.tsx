import React from 'react'
import {GlassWindowLayout} from '@/layouts/GlassWindowLayout'
import {Outlet, createRootRoute} from '@tanstack/react-router'

export const RootRoute = createRootRoute({
  component: Root
})

function Root() {
  return (
    <GlassWindowLayout>
      <Outlet />
    </GlassWindowLayout>
  )
}

import {createMemoryHistory, createRouter, createRoute} from '@tanstack/react-router'
import {RootRoute} from './__root'
import HomePage from '../pages/HomePage'
import ComponentReplacementShowcase from '../pages/ComponentReplacementShowcase'

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Define routes
const HomeRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomePage
})

const ComponentShowcaseRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/component-showcase',
  component: ComponentReplacementShowcase
})

// Create route tree
const rootTree = RootRoute.addChildren([HomeRoute, ComponentShowcaseRoute])

// Create router
const history = createMemoryHistory({
  initialEntries: ['/']
})
export const router = createRouter({routeTree: rootTree, history: history})

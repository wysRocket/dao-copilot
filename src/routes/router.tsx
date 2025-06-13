import {createMemoryHistory, createRouter, createRoute} from '@tanstack/react-router'
import {RootRoute} from './__root'
import HomePage from '../pages/HomePage'

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

// Create route tree
const rootTree = RootRoute.addChildren([HomeRoute])

// Create router
const history = createMemoryHistory({
  initialEntries: ['/']
})
export const router = createRouter({routeTree: rootTree, history: history})

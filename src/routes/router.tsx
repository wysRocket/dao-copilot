import { createMemoryHistory, createRouter, createRoute } from "@tanstack/react-router"
import { RootRoute } from "./__root"
import HomePage from "../pages/HomePage"
import ComponentReplacementShowcase from "../pages/ComponentReplacementShowcase"
import { GlassComponentsShowcase } from "../pages/GlassComponentsShowcase"

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Define routes
const HomeRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: HomePage,
})

const ComponentShowcaseRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/component-showcase",
  component: ComponentReplacementShowcase,
})

const GlassShowcaseRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/glass-showcase",
  component: GlassComponentsShowcase,
})

// Create route tree
const rootTree = RootRoute.addChildren([HomeRoute, ComponentShowcaseRoute, GlassShowcaseRoute])

// Create router
const history = createMemoryHistory({
  initialEntries: ["/"],
})
export const router = createRouter({ routeTree: rootTree, history: history })

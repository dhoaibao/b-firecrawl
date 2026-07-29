export const DEFAULT_ROUTE_MODE = "cloud-first" as const

export const ROUTE_MODES = [
  { value: "local-first" as const, label: "Local first (fallback to cloud)" },
  { value: "local-only" as const, label: "Local only" },
  { value: "cloud-first" as const, label: "Cloud first (fallback to external instance)" },
  { value: "cloud-only" as const, label: "Cloud only" },
] as const

export type RouteMode = (typeof ROUTE_MODES)[number]["value"]

import { api } from "@/lib/api"

export interface ParseRequest {
  url?: string
  formats?: Array<string | { type: string }>
}

function routeModeHeaders(routeMode?: string): Record<string, string> {
  return routeMode ? { "X-Firecrawl-Route-Mode": routeMode } : {}
}

export async function playgroundParse(
  file: File | null,
  params: ParseRequest,
  routeMode?: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (file) {
    const formData = new FormData()
    formData.append("file", file)
    if (params.formats) {
      formData.append("formats", JSON.stringify(params.formats))
    }
    const res = await fetch("/admin/api/playground/v1/parse", {
      method: "POST",
      body: formData,
      credentials: "include",
      signal,
      headers: routeModeHeaders(routeMode),
    })
    if (!res.ok) {
      let message: string
      const contentType = res.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        const json = (await res.json()) as { error?: string }
        message = json.error || `Request failed with ${res.status}`
      } else {
        const text = await res.text()
        message = text || `Request failed with ${res.status}`
      }
      throw new Error(message)
    }
    return res.json()
  }

  return api.post<unknown>("/admin/api/playground/v1/parse", params, {
    signal,
    headers: routeModeHeaders(routeMode),
  })
}

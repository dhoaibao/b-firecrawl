import type { ApiError } from "@/types"

class ApiErrorClass extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export { ApiErrorClass as ApiError }

async function parseError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as ApiError
    return json.error || `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(options?.headers || {}),
    },
  })

  if (!res.ok) {
    const message = await parseError(res)
    throw new ApiErrorClass(message, res.status)
  }

  return (await res.json()) as T
}

export const api = {
  get<T>(url: string, options?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, { ...options, method: "GET" })
  },

  post<T>(url: string, body: unknown, options?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      body: JSON.stringify(body),
    })
  },

  delete<T>(url: string, options?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, { ...options, method: "DELETE" })
  },
}

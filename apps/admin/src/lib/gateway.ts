import { API_BASE_URL } from "./api"

export function getGatewayUrl(): string {
  return API_BASE_URL || window.location.origin
}

export function isDev(): boolean {
  return import.meta.env.DEV
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL
  if (configured) return configured
  if (window.location.protocol === 'file:') {
    return import.meta.env.VITE_API_PROXY_TARGET || 'http://localhost:8003'
  }
  return ''
}

export function usesHashRouter(): boolean {
  return import.meta.env.MODE === 'singlefile' || window.location.protocol === 'file:'
}

function getRoute(): string {
  return usesHashRouter()
    ? window.location.hash.slice(1) || '/'
    : window.location.pathname + window.location.search
}

export function isLoginPage(): boolean {
  const pathname = getRoute().split('?')[0]
  return pathname === '/login' || pathname.startsWith('/login/')
}

export function redirectToLogin(): void {
  const destination = `/login?redirect=${encodeURIComponent(getRoute())}`
  if (usesHashRouter()) {
    window.location.hash = destination
  } else {
    window.location.href = destination
  }
}

import { getApiBaseUrl as getEnvApiBaseUrl } from '@/config/env'

const STORAGE_KEYS = {
  USER_INFO: 'user_info',
  API_BASE_URL: 'api_base_url',
} as const

export function getItem<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(key)
    if (item === null) return null
    try {
      return JSON.parse(item) as T
    } catch {
      return item as T
    }
  } catch {
    return null
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    const v = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, v)
  } catch {
    // 浏览器禁用存储时仍允许本次会话继续。
  }
}

export function setUserInfo(userInfo: unknown): void {
  setItem(STORAGE_KEYS.USER_INFO, userInfo)
}

export function getApiBaseUrl(): string {
  const saved = getItem<string>(STORAGE_KEYS.API_BASE_URL)
  if (saved) return saved
  return getEnvApiBaseUrl()
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_INFO)
  } catch {
    // 浏览器禁用存储时无需清理。
  }
}

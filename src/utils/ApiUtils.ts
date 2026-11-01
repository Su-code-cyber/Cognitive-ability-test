import { getApiBaseUrl, clearAuth } from '@/utils/LocalStorageUtil'
import { isDev } from '@/config/env'
import { AUTH_API } from '@/constants/apiPaths'
import { handleTokenRefresh } from '@/services/TokenRefreshService'
import { Modal } from 'antd'
import { isLoginPage, redirectToLogin } from '@/utils/navigation'

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
}

interface ApiRequestOptions extends RequestInit {
  /** Background connection probes use the exam's persistent pause banner. */
  quietNetworkError?: boolean
}

function getFullUrl(url: string): string {
  if (url.startsWith('http')) return url
  if (isDev()) return url
  const base = getApiBaseUrl()
  return `${base}${url}`
}

function normalizeErrorContent(content: unknown, fallback: string): string {
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) return fallback
  return text.length > 2000 ? `${text.slice(0, 2000)}\n\n（错误内容过长，已截断）` : text
}

/** Shows a backend unreachable dialog for every user because no server response can be trusted. */
function showBackendUnavailableError(content: unknown): void {
  Modal.error({
    title: '无法连接后端',
    content: normalizeErrorContent(content, '无法连接后端服务，请检查后端是否已经启动或网络是否正常。'),
    okText: '知道了',
  })
}

async function doSendRequest(options: RequestInit, fullUrl: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(fullUrl, { ...options, headers, credentials: 'include' })
  const text = await res.text()
  let data: ApiResponse
  try {
    data = JSON.parse(text) as ApiResponse
  } catch {
    data = { code: res.status, message: text || res.statusText }
  }
  return { response: res, data }
}

async function request<T = unknown>(
  url: string,
  options: ApiRequestOptions = {},
  retryAfterRefresh = false
): Promise<ApiResponse<T>> {
  const fullUrl = getFullUrl(url)

  // 刷新接口直接请求，不走刷新逻辑
  if (url.includes(AUTH_API.REFRESH)) {
    try {
      const { response, data } = await doSendRequest(options, fullUrl)
      const ok = response.ok && data.code !== 401
      if (ok) return data as ApiResponse<T>
      throw new Error(data.message || `请求失败: ${response.statusText}`)
    } catch (error) {
      throw error instanceof Error ? error : new Error('刷新Token失败')
    }
  }

  let response: Response
  let data: ApiResponse
  try {
    ({ response, data } = await doSendRequest(options, fullUrl))
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败'
    if (!options.quietNetworkError) showBackendUnavailableError(message)
    throw error instanceof Error ? error : new Error(message)
  }

  const isSuccess = response.ok && data.code !== 401
  if (isSuccess) return data as ApiResponse<T>

  const isUnauthorized = response.status === 401 || data.code === 401
  if (!isUnauthorized) {
    const message = data.message || `请求失败: ${response.statusText}`
    throw new Error(message)
  }

  // 登录页直接报错
  if (isLoginPage()) throw new Error(data.message || '未授权，请先登录')

  // 已重试过，跳转登录页
  if (retryAfterRefresh) {
    clearAuth()
    setTimeout(redirectToLogin, 200)
    throw new Error('认证失败，请重新登录')
  }

  // 触发刷新并重试
  return handleTokenRefresh(url, options, request as (url: string, options: RequestInit, retryAfterRefresh: boolean) => Promise<ApiResponse<unknown>>) as Promise<ApiResponse<T>>
}

export function get<T = unknown>(url: string, params?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
  let u = url
  if (params) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) q.set(k, String(v))
    })
    const s = q.toString()
    if (s) u += `?${s}`
  }
  return request<T>(u, { method: 'GET' })
}

export function post<T = unknown>(url: string, body?: unknown, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
  return request<T>(url, {
    ...options,
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

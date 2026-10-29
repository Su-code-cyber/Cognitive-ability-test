import { clearAuth } from '@/utils/LocalStorageUtil'
import type { ApiResponse } from '@/utils/ApiUtils'
import { isLoginPage, redirectToLogin } from '@/utils/navigation'

// 刷新状态管理
let isRefreshing = false
const failedQueue: Array<{
  resolve: (value: ApiResponse<unknown>) => void
  reject: (error: unknown) => void
  url: string
  options: RequestInit
  retryFn: (url: string, options: RequestInit, retryAfterRefresh: boolean) => Promise<ApiResponse<unknown>>
}> = []

async function processQueue(error: unknown) {
  for (const p of failedQueue) {
    if (error) {
      p.reject(error)
    } else {
      try {
        const result = await p.retryFn(p.url, p.options, true)
        p.resolve(result)
      } catch (err) {
        p.reject(err)
      }
    }
  }
  failedQueue.length = 0
}

export async function handleTokenRefresh(
  url: string,
  options: RequestInit,
  retryFn: (url: string, options: RequestInit, retryAfterRefresh: boolean) => Promise<ApiResponse<unknown>>
): Promise<ApiResponse<unknown>> {
  // 如果已经在刷新中，将请求加入队列等待
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      failedQueue.push({
        resolve: resolve as (v: ApiResponse<unknown>) => void,
        reject,
        url,
        options,
        retryFn,
      })
    })
  }

  // 开始刷新流程
  isRefreshing = true

  // 动态导入 authService 避免循环依赖
  const { default: authService } = await import('@/services/AuthService')

  const refreshPromise = authService.refreshToken()
    .then(async () => {
      isRefreshing = false
      await processQueue(null)
    })
    .catch(async (err) => {
      isRefreshing = false
      await processQueue(err)
      clearAuth()
      if (!isLoginPage()) {
        setTimeout(redirectToLogin, 200)
      }
      throw err
    })

  await refreshPromise
  // 刷新成功后重试原请求
  return retryFn(url, options, true)
}

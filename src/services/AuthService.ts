import { post, get } from '@/utils/ApiUtils'
import { setUserInfo, clearAuth } from '@/utils/LocalStorageUtil'
import { AUTH_API } from '@/constants/apiPaths'

interface PasswordAuthRequest {
  phone: string
  password: string
}

interface LoginResponse {
  userInfo: UserInfo
}

export interface UserInfo {
  phone: string
}

class AuthService {
  async login(req: PasswordAuthRequest): Promise<LoginResponse> {
    const res = await post<LoginResponse>(AUTH_API.LOGIN, req)
    if (res.code === 200 && res.data) {
      setUserInfo(res.data.userInfo)
      return res.data
    }
    throw new Error(res.message || '登录失败')
  }

  /** 注册成功后后端会写入 Cookie 并返回与登录一致的结构 */
  async register(req: PasswordAuthRequest): Promise<LoginResponse> {
    const res = await post<LoginResponse>(AUTH_API.REGISTER, req)
    if (res.code === 200 && res.data) {
      setUserInfo(res.data.userInfo)
      return res.data
    }
    throw new Error(res.message || '注册失败')
  }

  async refreshToken(): Promise<void> {
    const res = await post(AUTH_API.REFRESH, {})
    // Token 通过 Cookie 返回，res.data 可能为空，只检查状态码
    if (res.code === 200) return
    throw new Error(res.message || '刷新Token失败')
  }

  async logout(): Promise<void> {
    try {
      await post(AUTH_API.LOGOUT)
    } finally {
      clearAuth()
    }
  }

  async getCurrentUser(): Promise<UserInfo> {
    const res = await get<UserInfo>(AUTH_API.ME)
    if (res.code === 200 && res.data) {
      setUserInfo(res.data)
      return res.data
    }
    throw new Error(res.message || '获取用户信息失败')
  }
}

const authService = new AuthService()
export default authService

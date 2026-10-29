import { createContext } from 'react'
import type { UserInfo } from '@/services/AuthService'

interface AuthContextValue {
  user: UserInfo | null
  loading: boolean
  setUser: (user: UserInfo | null) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

import React, { useCallback, useEffect, useState } from 'react'
import type { UserInfo } from '@/services/AuthService'
import { getItem } from '@/utils/LocalStorageUtil'
import authService from '@/services/AuthService'
import { AuthContext } from '@/contexts/authState'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => getItem<UserInfo>('user_info'))
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const u = await authService.getCurrentUser()
      setUser(u)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUser(null)
  }, [])

  useEffect(() => {
    if (user) {
      setLoading(false)
      return
    }
    refreshUser()
  }, [user, refreshUser])

  const value = {
    user,
    loading,
    setUser,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

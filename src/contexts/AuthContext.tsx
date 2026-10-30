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
    try {
      await authService.logout()
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    // A local cache is only for display; every page load checks the server session.
    refreshUser()
  }, [refreshUser])

  const value = {
    user,
    loading,
    setUser,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

import type { User } from '@app/shared'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'restaurant-auth'

type StoredAuth = { accessToken: string; user: User }

function readStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredAuth
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = readStoredAuth()
    if (stored) {
      api.setAccessToken(stored.accessToken)
      setUser(stored.user)
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const response = await api.login({ email, password })
    api.setAccessToken(response.accessToken)
    setUser(response.user)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(response))
  }

  const logout = () => {
    api.setAccessToken(null)
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>')
  }
  return ctx
}

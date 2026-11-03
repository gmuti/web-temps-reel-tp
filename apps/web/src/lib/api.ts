import {
  authResponseSchema,
  dishesListSchema,
  floorPlanSchema,
  type AuthResponse,
  type Dish,
  type FloorPlan,
  type LoginInput,
  type UpdateFloorPlanRequest,
} from '@app/shared'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  status: number
  // Code d'erreur métier renvoyé par l'API (ex. FLOOR_PLAN_CONFLICT), s'il y en a un.
  errorCode: string | undefined

  constructor(status: number, message: string, errorCode?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
  }
}

let currentToken: string | null = null

export function setAccessToken(token: string | null) {
  currentToken = token
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = Array.isArray(body?.message)
      ? body.message.map((issue: { path?: string; message: string }) => issue.message).join(', ')
      : (body?.message ?? response.statusText)
    throw new ApiError(response.status, message, body?.errorCode)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const data = await request<unknown>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return authResponseSchema.parse(data)
}

export async function getDishes(): Promise<Dish[]> {
  const data = await request<unknown>('/dishes')
  return dishesListSchema.parse(data)
}

export async function getFloorPlan(): Promise<FloorPlan> {
  const data = await request<unknown>('/floor-plan')
  return floorPlanSchema.parse(data)
}

export async function saveFloorPlan(input: UpdateFloorPlanRequest): Promise<FloorPlan> {
  const data = await request<unknown>('/floor-plan', { method: 'PUT', body: JSON.stringify(input) })
  return floorPlanSchema.parse(data)
}

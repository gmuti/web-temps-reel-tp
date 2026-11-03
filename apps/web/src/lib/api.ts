import {
  authResponseSchema,
  orderSchema,
  ordersListSchema,
  type AuthResponse,
  type CreateOrderRequest,
  type ListOrdersRequest,
  type LoginInput,
  type Order,
} from '@app/shared'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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
    throw new ApiError(response.status, message)
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

export async function getOrders(query: ListOrdersRequest = {}): Promise<Order[]> {
  const search = new URLSearchParams()
  if (query.status) search.set('status', query.status)
  const qs = search.toString()
  const data = await request<unknown[]>(`/orders${qs ? `?${qs}` : ''}`)
  return ordersListSchema.parse(data)
}

export async function createOrder(input: CreateOrderRequest): Promise<Order> {
  const data = await request<unknown>('/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return orderSchema.parse(data)
}

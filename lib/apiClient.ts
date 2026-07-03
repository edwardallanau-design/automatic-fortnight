export class ApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error, data.message)
  }

  return data as T
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error, data.message)
  }

  return data as T
}

async function del(path: string): Promise<void> {
  const response = await fetch(path, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    const data = await response.json()
    throw new ApiError(data.error, data.message)
  }
}

export const apiClient = { post, patch, del }

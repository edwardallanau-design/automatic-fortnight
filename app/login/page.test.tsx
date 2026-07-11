import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from './page'
import { apiClient, ApiError } from '@/lib/apiClient'

const push = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { post: vi.fn() },
  }
})

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to /dashboard and refreshes the router so the session-dependent layout re-renders', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ role: 'staff' })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an error and does not navigate when the password is wrong', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('INVALID_CREDENTIAL', 'Incorrect password'))
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password')
    expect(push).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})

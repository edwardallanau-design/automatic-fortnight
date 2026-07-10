import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreatePaymentMethodForm } from './CreatePaymentMethodForm'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } }
})

describe('CreatePaymentMethodForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits name and accountInfo, then refreshes and clears the form', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'p1', name: 'GCash', active: true, qrImageUrl: null, accountInfo: '0917x' })
    const user = userEvent.setup()
    render(<CreatePaymentMethodForm />)

    await user.type(screen.getByLabelText('Name'), 'GCash')
    await user.type(screen.getByLabelText('Account / wallet number (optional)'), '0917x')
    await user.click(screen.getByRole('button', { name: 'Add payment method' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/payment-methods', { name: 'GCash', accountInfo: '0917x' })
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an inline error when submission fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('VALIDATION', 'name is required'))
    const user = userEvent.setup()
    render(<CreatePaymentMethodForm />)

    await user.click(screen.getByRole('button', { name: 'Add payment method' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name is required')
  })
})

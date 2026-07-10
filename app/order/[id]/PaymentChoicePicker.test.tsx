import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentChoicePicker } from './PaymentChoicePicker'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { ...actual.apiClient, post: vi.fn() } }
})

const methods = [
  { id: 'p1', name: 'GCash', qrImageUrl: null, accountInfo: '0917x' },
  { id: 'p2', name: 'Bank Transfer', qrImageUrl: 'https://blob.example/p2.png', accountInfo: null },
]

describe('PaymentChoicePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Pay at counter and Pay online buttons initially', () => {
    render(<PaymentChoicePicker orderId="o1" paymentMethods={methods} />)

    expect(screen.getByRole('button', { name: 'Pay at counter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay online' })).toBeInTheDocument()
  })

  it('choosing Pay at counter posts to the counter route and refreshes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    const user = userEvent.setup()
    render(<PaymentChoicePicker orderId="o1" paymentMethods={methods} />)

    await user.click(screen.getByRole('button', { name: 'Pay at counter' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders/o1/payment-choice/counter', {})
    expect(refresh).toHaveBeenCalled()
  })

  it('choosing Pay online reveals the method list and a required reference field', async () => {
    const user = userEvent.setup()
    render(<PaymentChoicePicker orderId="o1" paymentMethods={methods} />)

    await user.click(screen.getByRole('button', { name: 'Pay online' }))

    expect(screen.getByText('GCash')).toBeInTheDocument()
    expect(screen.getByText('Bank Transfer')).toBeInTheDocument()
    expect(screen.getByLabelText('Reference number')).toBeInTheDocument()
  })

  it('submitting online payment posts paymentMethodId and reference, then refreshes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    const user = userEvent.setup()
    render(<PaymentChoicePicker orderId="o1" paymentMethods={methods} />)

    await user.click(screen.getByRole('button', { name: 'Pay online' }))
    await user.click(screen.getByText('GCash'))
    await user.type(screen.getByLabelText('Reference number'), 'TXN123')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders/o1/payment-choice/online', {
      paymentMethodId: 'p1',
      reference: 'TXN123',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an inline error when submission fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('CONFLICT', 'Payment choice has already been made for this order'))
    const user = userEvent.setup()
    render(<PaymentChoicePicker orderId="o1" paymentMethods={methods} />)

    await user.click(screen.getByRole('button', { name: 'Pay at counter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Payment choice has already been made for this order')
  })

  it('hides the Pay online button when there are no active payment methods', () => {
    render(<PaymentChoicePicker orderId="o1" paymentMethods={[]} />)

    expect(screen.getByRole('button', { name: 'Pay at counter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay online' })).not.toBeInTheDocument()
  })
})

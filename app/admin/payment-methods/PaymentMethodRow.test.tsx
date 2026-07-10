import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentMethodRow } from './PaymentMethodRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { ...actual.apiClient, patch: vi.fn() } }
})

function renderRow(overrides: Partial<React.ComponentProps<typeof PaymentMethodRow>> = {}) {
  return render(
    <PaymentMethodRow
      id="p1"
      name="GCash"
      accountInfo="0917x"
      qrImageUrl={null}
      active
      editable
      {...overrides}
    />,
  )
}

describe('PaymentMethodRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the name and an Active/Inactive toggle', () => {
    renderRow()
    expect(screen.getByText('GCash')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Active: GCash' })).toBeChecked()
  })

  it('does not show Edit when not editable', () => {
    renderRow({ editable: false })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('toggling active calls PATCH with the new value and refreshes', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    const user = userEvent.setup()
    renderRow()

    await user.click(screen.getByRole('switch', { name: 'Active: GCash' }))

    expect(apiClient.patch).toHaveBeenCalledWith('/api/payment-methods/p1', { active: false })
    expect(refresh).toHaveBeenCalled()
  })

  it('reverts the toggle and shows an error when the PATCH fails', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('NOT_FOUND', 'Payment method not found'))
    const user = userEvent.setup()
    renderRow()

    await user.click(screen.getByRole('switch', { name: 'Active: GCash' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Payment method not found')
    expect(screen.getByRole('switch', { name: 'Active: GCash' })).toBeChecked()
  })

  it('entering edit mode shows name and accountInfo inputs, Save cancels back to view on success', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    const user = userEvent.setup()
    renderRow()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Name for GCash')).toHaveValue('GCash')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(apiClient.patch).toHaveBeenCalledWith('/api/payment-methods/p1', { name: 'GCash', accountInfo: '0917x' })
    expect(refresh).toHaveBeenCalled()
  })
})

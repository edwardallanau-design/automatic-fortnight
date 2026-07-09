import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AcceptingOrdersToggle } from './AcceptingOrdersToggle'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { patch: vi.fn() },
  }
})

describe('AcceptingOrdersToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders checked and labeled "Accepting orders" when open', () => {
    render(<AcceptingOrdersToggle acceptingOrders={true} />)

    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByText('Accepting orders')).toBeInTheDocument()
  })

  it('renders unchecked and labeled "Not accepting orders" when closed', () => {
    render(<AcceptingOrdersToggle acceptingOrders={false} />)

    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByText('Not accepting orders')).toBeInTheDocument()
  })

  it('calls PATCH with the new value and refreshes on success', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<AcceptingOrdersToggle acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('switch'))

    expect(apiClient.patch).toHaveBeenCalledWith('/api/venue-settings', { acceptingOrders: false })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('reverts the toggle and shows an error when the request fails', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('FORBIDDEN', 'Insufficient role for this action'))
    render(<AcceptingOrdersToggle acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('switch'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient role for this action')
    expect(screen.getByRole('switch')).toBeChecked()
  })
})

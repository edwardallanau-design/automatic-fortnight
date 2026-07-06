import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Cart } from './Cart'
import { apiClient, ApiError } from '@/lib/apiClient'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return {
    ...actual,
    apiClient: { post: vi.fn() },
  }
})

const items = [
  { id: 'm1', name: 'Burger', price: '12.50', available: true },
  { id: 'm2', name: 'Fries', price: '4.00', available: false },
]

describe('Cart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds an item to the cart when its menu button is tapped', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })

  it('increments and decrements quantity, removing the line at zero', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    expect(within(order).queryByText('Burger')).not.toBeInTheDocument()
  })

  it('disables submit while the cart is empty', () => {
    render(<Cart tableId="t1" items={items} />)
    expect(screen.getByRole('button', { name: 'Submit order' })).toBeDisabled()
  })

  it('redirects to the order page after a successful submit', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      id: 'o1',
      orderNumber: 47,
      items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
    })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))
    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    })
  })

  it('ignores a second submit click while the first is still in flight', async () => {
    let resolvePost!: (value: { id: string; orderNumber: number; items: never[] }) => void
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    const submit = screen.getByRole('button', { name: 'Submit order' })
    await user.click(submit)
    await user.click(submit)

    resolvePost({ id: 'o1', orderNumber: 47, items: [] })
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))

    expect(apiClient.post).toHaveBeenCalledTimes(1)
  })

  it('shows an inline error and keeps the cart intact on submit failure', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('MENU_ITEM_SOLD_OUT', 'Burger is no longer available'))
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Burger is no longer available')
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })
})

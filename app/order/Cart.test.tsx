import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
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

  it('opens the review modal instead of submitting when "Submit order" is tapped', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    expect(screen.getByRole('dialog', { name: 'Review your order' })).toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('"Back to menu" closes the review modal without submitting or changing the cart', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Back to menu' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })

  it('redirects to the order page after confirming in the review modal', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      id: 'o1',
      orderNumber: 47,
      items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }],
    })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))
    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    })
  })

  it('ignores a second Confirm Order click while the first is still in flight', async () => {
    let resolvePost!: (value: { id: string; orderNumber: number; items: never[] }) => void
    vi.mocked(apiClient.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    const confirm = screen.getByRole('button', { name: 'Confirm Order' })
    await user.click(confirm)
    await user.click(confirm)

    resolvePost({ id: 'o1', orderNumber: 47, items: [] })
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/order/o1'))

    expect(apiClient.post).toHaveBeenCalledTimes(1)
  })

  it('shows an inline error in the modal and keeps the cart intact on submit failure', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('MENU_ITEM_SOLD_OUT', 'Burger is no longer available'))
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Burger is no longer available')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })

  it('shows a toast confirming the item was added', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Added Burger to cart')
  })

  it('replaces the toast when a different item is added', async () => {
    const threeItems = [...items, { id: 'm3', name: 'Shake', price: '5.00', available: true }]
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={threeItems} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: /Shake/ }))

    const toasts = screen.getAllByRole('status')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toHaveTextContent('Added Shake to cart')
  })

  it('reverses exactly the last add when Undo is tapped, leaving other quantities alone', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    // toast now reflects the most recent +1, cart quantity is 3

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('2')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('removes the line entirely if Undo is tapped right after the first add', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).queryByText('Burger')).not.toBeInTheDocument()
  })

  it('auto-dismisses the toast after 4 seconds', async () => {
    vi.useFakeTimers()
    render(<Cart tableId="t1" items={items} />)

    fireEvent.click(screen.getByRole('button', { name: /Burger/ }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent, waitFor } from '@testing-library/react'
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
    sessionStorage.clear()
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
    await waitFor(() => expect(within(order).queryByText('Burger')).not.toBeInTheDocument())
  })

  it('disables submit while the cart is empty', () => {
    render(<Cart tableId="t1" items={items} />)
    expect(screen.getByRole('button', { name: 'Submit order' })).toBeDisabled()
  })

  it('restores a previously saved cart for this table on mount', () => {
    sessionStorage.setItem(
      'cart:t1',
      JSON.stringify([{ menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 2 }]),
    )
    render(<Cart tableId="t1" items={items} />)

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
    expect(within(order).getByText('2')).toBeInTheDocument()
  })

  it('saves the cart to sessionStorage under a table-specific key as it changes', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))

    const saved = JSON.parse(sessionStorage.getItem('cart:t1')!)
    expect(saved).toEqual([{ menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 1 }])
  })

  it('does not restore a cart saved under a different table id', () => {
    sessionStorage.setItem(
      'cart:t2',
      JSON.stringify([{ menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 1 }]),
    )
    render(<Cart tableId="t1" items={items} />)

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).queryByText('Burger')).not.toBeInTheDocument()
  })

  it('starts with an empty cart if the saved data is corrupted', () => {
    sessionStorage.setItem('cart:t1', 'not valid json{{{')
    render(<Cart tableId="t1" items={items} />)

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
  })

  it('applies an increasing stagger delay to menu items in order', () => {
    const { container } = render(<Cart tableId="t1" items={items} />)
    const buttons = container.querySelectorAll('.menu-item-button')
    expect(buttons[0]).toHaveStyle({ '--stagger-delay': '0ms' })
    expect(buttons[1]).toHaveStyle({ '--stagger-delay': '30ms' })
  })

  it('applies a per-group stagger delay that resets at each category', () => {
    const twoCategoryItems = [
      { id: 'm1', name: 'Latte', price: '4.50', available: true, category: { id: 'c1', name: 'Drinks', sortOrder: 0 } },
      { id: 'm2', name: 'Croissant', price: '3.00', available: true, category: { id: 'c2', name: 'Pastries', sortOrder: 1 } },
    ]
    const { container } = render(<Cart tableId="t1" items={twoCategoryItems} />)
    const buttons = container.querySelectorAll('.menu-item-button')
    // first item in each group starts the stagger over at 0ms
    expect(buttons[0]).toHaveStyle({ '--stagger-delay': '0ms' })
    expect(buttons[1]).toHaveStyle({ '--stagger-delay': '0ms' })
  })

  it('keeps the order panel collapsed by default even when the cart is empty', () => {
    const { container } = render(<Cart tableId="t1" items={items} />)
    expect(container.querySelector('.cart-summary')).toHaveClass('cart-summary--collapsed')
  })

  it('does not change collapsed state when the first item is added', async () => {
    const user = userEvent.setup()
    const { container } = render(<Cart tableId="t1" items={items} />)
    expect(container.querySelector('.cart-summary')).toHaveClass('cart-summary--collapsed')

    await user.click(screen.getByRole('button', { name: /Burger/ }))

    expect(container.querySelector('.cart-summary')).toHaveClass('cart-summary--collapsed')
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

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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

  it('clears the error when the customer backs out of a failed review instead of retrying', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('MENU_ITEM_SOLD_OUT', 'Burger is no longer available'))
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Burger is no longer available')

    await user.click(screen.getByRole('button', { name: 'Back to menu' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('removes the line entirely if Undo is tapped right after the first add', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const order = screen.getByRole('region', { name: 'Your order' })
    await waitFor(() => expect(within(order).queryByText('Burger')).not.toBeInTheDocument())
  })

  it('marks a line as removing during its exit animation before actually removing it', async () => {
    const user = userEvent.setup()
    const { container } = render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))

    expect(container.querySelector('.cart-summary__line--removing')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.cart-summary__line--removing')).not.toBeInTheDocument())
  })

  it('cancels the pending removal and applies the re-add when the menu item is tapped again during the removal fade', async () => {
    vi.useFakeTimers()
    const { container } = render(<Cart tableId="t1" items={items} />)

    fireEvent.click(screen.getByRole('button', { name: /^Burger/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    expect(container.querySelector('.cart-summary__line--removing')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Burger/ }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('2')).toBeInTheDocument()
    expect(container.querySelector('.cart-summary__line--removing')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('auto-dismisses the toast after 4 seconds', async () => {
    vi.useFakeTimers()
    render(<Cart tableId="t1" items={items} />)

    fireEvent.click(screen.getByRole('button', { name: /Burger/ }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4200)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('the × button dismisses the toast without undoing the add', async () => {
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    const order = screen.getByRole('region', { name: 'Your order' })
    expect(within(order).getByText('Burger')).toBeInTheDocument()
  })

  it('clears the saved cart from sessionStorage after a successful submit', async () => {
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
    expect(sessionStorage.getItem('cart:t1')).toBeNull()
  })

  it('prefills the name field from a previously saved order name', async () => {
    sessionStorage.setItem('orderName:t1', 'Edward')
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))

    expect(screen.getByLabelText('Name for this order')).toHaveValue('Edward')
  })

  it('includes the trimmed name in the payload and saves it for next time', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.type(screen.getByLabelText('Name for this order'), '  Edward ')
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
      customerName: 'Edward',
    })
    expect(sessionStorage.getItem('orderName:t1')).toBe('Edward')
  })

  it('omits customerName from the payload when the field is left blank', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    render(<Cart tableId="t1" items={items} />)

    await user.click(screen.getByRole('button', { name: /Burger/ }))
    await user.click(screen.getByRole('button', { name: 'Submit order' }))
    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))

    expect(apiClient.post).toHaveBeenCalledWith('/api/orders', {
      tableId: 't1',
      items: [{ menuItemId: 'm1', quantity: 1 }],
    })
    expect(sessionStorage.getItem('orderName:t1')).toBeNull()
  })

  it('does not crash when sessionStorage.setItem throws on cart changes', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    try {
      const user = userEvent.setup()
      render(<Cart tableId="t1" items={items} />)

      await user.click(screen.getByRole('button', { name: /Burger/ }))

      // Component should still be interactive and show the item despite storage failure
      const order = screen.getByRole('region', { name: 'Your order' })
      expect(within(order).getByText('Burger')).toBeInTheDocument()
      expect(within(order).getByText('1')).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  describe('category grouping', () => {
    it('groups items under their category heading, ordered by sortOrder', () => {
      const categorized = [
        { id: 'm1', name: 'Latte', price: '4.50', available: true, category: { id: 'c2', name: 'Drinks', sortOrder: 1 } },
        { id: 'm2', name: 'Croissant', price: '3.50', available: true, category: { id: 'c1', name: 'Pastries', sortOrder: 0 } },
      ]
      render(<Cart tableId="t1" items={categorized} />)

      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(headings.indexOf('Pastries')).toBeLessThan(headings.indexOf('Drinks'))
    })

    it('renders uncategorized items under the "Other" heading when no items have a category', () => {
      render(<Cart tableId="t1" items={items} />)

      expect(screen.getByRole('heading', { name: 'Other' })).toBeInTheDocument()
    })

    it('shows the "Other" group last when some items have a category and some do not', () => {
      const mixed = [
        { id: 'm1', name: 'Latte', price: '4.50', available: true, category: { id: 'c1', name: 'Drinks', sortOrder: 0 } },
        { id: 'm2', name: 'Mystery Item', price: '1.00', available: true },
      ]
      render(<Cart tableId="t1" items={mixed} />)

      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(headings[headings.length - 1]).toBe('Other')
    })
  })
})

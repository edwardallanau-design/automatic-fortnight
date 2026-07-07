import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderCard, type OrderCardOrder } from './OrderCard'

const order: OrderCardOrder = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  customerName: 'Edward',
  table: { number: 4 },
  items: [
    { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
    { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
  ],
}

describe('OrderCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:02:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders table, order number, customer name, item count, and total', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByText('· Edward')).toBeInTheDocument()
    expect(screen.getByText('#101')).toBeInTheDocument()
    expect(screen.getByText('3 items')).toBeInTheDocument()
    expect(screen.getByText('$29.00')).toBeInTheDocument()
  })

  it('shows "Needs confirmation" for a Pending order and "Awaiting payment" for a Confirmed one', () => {
    const { rerender } = render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Needs confirmation')).toBeInTheDocument()

    rerender(<OrderCard order={{ ...order, fulfillmentStatus: 'Confirmed' }} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
  })

  it('calls onOpen when clicked', async () => {
    vi.useRealTimers()
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<OrderCard order={order} exiting={false} onOpen={onOpen} />)

    await user.click(screen.getByRole('button', { name: /Order 101/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('applies the exiting class when exiting is true', () => {
    render(<OrderCard order={order} exiting={true} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Order 101/ })).toHaveClass('order-card--exiting')
  })

  it('singularizes the item count for a single item', () => {
    render(
      <OrderCard
        order={{ ...order, items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 }] }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('shows no name segment when the order has none', () => {
    render(<OrderCard order={{ ...order, customerName: null }} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })
})

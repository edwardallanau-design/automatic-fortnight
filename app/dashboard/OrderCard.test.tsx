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

  it('shows the badge as the order\'s paymentStatus verbatim, regardless of fulfillmentStatus', () => {
    const { rerender } = render(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Pending', paymentStatus: 'Unpaid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
    expect(screen.getByText('Unpaid')).not.toHaveClass('order-card__badge--paid')

    rerender(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Pending', paymentStatus: 'Paid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toHaveClass('order-card__badge--paid')

    rerender(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Confirmed', paymentStatus: 'Unpaid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Unpaid')).toBeInTheDocument()

    rerender(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Confirmed', paymentStatus: 'Paid' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toHaveClass('order-card__badge--paid')
  })

  it('shows relative time for a Pending order', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.getByText('2 min ago')).toBeInTheDocument()
  })

  it('shows a wall-clock timestamp for a Confirmed order, derived from confirmedAt not createdAt', () => {
    render(
      <OrderCard
        order={{ ...order, fulfillmentStatus: 'Confirmed', confirmedAt: '2026-07-04T18:30:00.000Z' }}
        exiting={false}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).toBeInTheDocument()
    expect(screen.queryByText(/min ago|just now/)).not.toBeInTheDocument()
  })

  it('never renders "Needs confirmation" or "Awaiting payment"', () => {
    render(<OrderCard order={order} exiting={false} onOpen={vi.fn()} />)
    expect(screen.queryByText('Needs confirmation')).not.toBeInTheDocument()
    expect(screen.queryByText('Awaiting payment')).not.toBeInTheDocument()
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
    expect(screen.queryByText(/· Edward/)).not.toBeInTheDocument()
  })
})

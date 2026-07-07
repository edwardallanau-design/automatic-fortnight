import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderDetailPage from './page'
import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  getOrderById: vi.fn(),
}))

// OrderStatusPoller is a client component with next/navigation + apiClient deps;
// stub it so the page test stays focused on branching.
vi.mock('./OrderStatusPoller', () => ({
  OrderStatusPoller: ({ order }: { order: { orderNumber: number } }) => (
    <div data-testid="order-ticket">editable #{order.orderNumber}</div>
  ),
}))

function priceOf(value: string) {
  return { toString: () => value } as never
}

function order(fulfillmentStatus: string) {
  return {
    id: 'o1',
    orderNumber: 47,
    fulfillmentStatus,
    paymentStatus: 'Unpaid',
    items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: priceOf('12.50'), quantity: 1 }],
    table: { id: 't1', number: 4, createdAt: new Date() },
  }
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an error state when the order does not exist', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new NotFoundError('Order not found'))

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'missing' }) })
    render(ui)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't find that order. Please ask staff for help.",
    )
  })

  it('does not show a header or back link when the order is not found', async () => {
    vi.mocked(getOrderById).mockRejectedValue(new NotFoundError('Order not found'))

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'missing' }) })
    render(ui)

    expect(screen.queryByRole('link', { name: '← Menu' })).not.toBeInTheDocument()
  })

  it('renders the editable ticket for a Pending order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Pending') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByTestId('order-ticket')).toHaveTextContent('editable #47')
  })

  it('shows the table header and a back-to-menu link for a Pending order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Pending') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('Table 4')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Menu' })).toHaveAttribute('href', '/order?table=t1')
  })

  it('renders a locked note for a Confirmed order and no editable ticket', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Confirmed') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText(/Confirmed by staff/)).toBeInTheDocument()
    expect(screen.queryByTestId('order-ticket')).not.toBeInTheDocument()
  })

  it('renders a cancelled notice for a Cancelled order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Cancelled') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('This order was cancelled.')).toBeInTheDocument()
  })

  it('shows the table header and back-to-menu link for a Cancelled order', async () => {
    vi.mocked(getOrderById).mockResolvedValue(order('Cancelled') as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByRole('link', { name: '← Menu' })).toHaveAttribute('href', '/order?table=t1')
  })

  it('shows the customer name on a confirmed order', async () => {
    vi.mocked(getOrderById).mockResolvedValue({
      id: 'o1',
      orderNumber: 7,
      fulfillmentStatus: 'Confirmed',
      customerName: 'Edward',
      items: [
        { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: { toString: () => '12.50' }, quantity: 1 },
      ],
      table: { id: 't1', number: 4, createdAt: new Date() },
    } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })
})

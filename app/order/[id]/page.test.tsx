import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderDetailPage from './page'
import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/orderService', () => ({
  getOrderById: vi.fn(),
}))

// PaymentChoicePicker is a client component that calls next/navigation's
// useRouter(); it's rendered for real (not stubbed) in the gate tests below,
// so it needs a router mock the same way OrderStatusPoller would.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// OrderStatusPoller is a client component with next/navigation + apiClient deps;
// stub it so the page test stays focused on branching.
vi.mock('./OrderStatusPoller', () => ({
  OrderStatusPoller: ({ order }: { order: { orderNumber: number } }) => (
    <div data-testid="order-ticket">editable #{order.orderNumber}</div>
  ),
}))

vi.mock('@/lib/paymentMethodService', () => ({
  listPaymentMethods: vi.fn().mockResolvedValue([]),
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
    paymentChoice: 'Counter',
    paymentMethodNameSnapshot: null,
    paymentReference: null,
    items: [{ id: 'oi1', nameSnapshot: 'Burger', priceSnapshot: priceOf('12.50'), quantity: 1 }],
    orderingPoint: { id: 't1', branchId: 'b1', label: 'Table 4', isCounter: false, createdAt: new Date() },
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
      paymentChoice: 'Counter',
      paymentMethodNameSnapshot: null,
      paymentReference: null,
      items: [
        { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: { toString: () => '12.50' }, quantity: 1 },
      ],
      orderingPoint: { id: 't1', branchId: 'b1', label: 'Table 4', isCounter: false, createdAt: new Date() },
    } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })

  it('renders the Counter ordering point by its stored label', async () => {
    vi.mocked(getOrderById).mockResolvedValue({
      ...order('Pending'),
      orderingPoint: { id: 't0', branchId: 'b1', label: 'Counter', isCounter: true, createdAt: new Date() },
    } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByText('Counter')).toBeInTheDocument()
    expect(screen.queryByText('Table 0')).not.toBeInTheDocument()
  })

  it('shows the payment choice picker for a real-table order with no choice yet', async () => {
    vi.mocked(getOrderById).mockResolvedValue({ ...order('Pending'), paymentChoice: 'None' } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByRole('button', { name: 'Pay at counter' })).toBeInTheDocument()
    expect(screen.queryByTestId('order-ticket')).not.toBeInTheDocument()
  })

  it('skips the picker for a staff-assisted order at a Counter ordering point', async () => {
    vi.mocked(getOrderById).mockResolvedValue({
      ...order('Pending'),
      paymentChoice: 'None',
      orderingPoint: { id: 't0', branchId: 'b1', label: 'Counter', isCounter: true, createdAt: new Date() },
    } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.queryByRole('button', { name: 'Pay at counter' })).not.toBeInTheDocument()
    expect(screen.getByTestId('order-ticket')).toBeInTheDocument()
  })

  it('shows the picker for a Confirmed order that never made a choice', async () => {
    vi.mocked(getOrderById).mockResolvedValue({ ...order('Confirmed'), paymentChoice: 'None' } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.getByRole('button', { name: 'Pay at counter' })).toBeInTheDocument()
  })

  it('does not show the picker for a Cancelled order even with no choice made', async () => {
    vi.mocked(getOrderById).mockResolvedValue({ ...order('Cancelled'), paymentChoice: 'None' } as never)

    const ui = await OrderDetailPage({ params: Promise.resolve({ id: 'o1' }) })
    render(ui)

    expect(screen.queryByRole('button', { name: 'Pay at counter' })).not.toBeInTheDocument()
    expect(screen.getByText('This order was cancelled.')).toBeInTheDocument()
  })
})

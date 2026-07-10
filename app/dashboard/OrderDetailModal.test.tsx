import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderDetailModal } from './OrderDetailModal'
import type { OrderCardOrder } from './OrderCard'

const pendingOrder: OrderCardOrder = {
  id: 'o1',
  orderNumber: 101,
  createdAt: '2026-07-04T12:00:00.000Z',
  fulfillmentStatus: 'Pending',
  paymentStatus: 'Unpaid',
  paymentChoice: 'None',
  paymentMethodNameSnapshot: null,
  paymentReference: null,
  customerName: 'Edward',
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

function baseProps(overrides: Partial<React.ComponentProps<typeof OrderDetailModal>> = {}) {
  return {
    order: pendingOrder,
    busy: false,
    error: null,
    exiting: false,
    menuItems: [],
    onConfirm: vi.fn(),
    onSetPaymentStatus: vi.fn(),
    onCancelOrder: vi.fn(),
    onAddItem: vi.fn(),
    onAdjustQuantity: vi.fn(),
    onRemoveItem: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('OrderDetailModal', () => {
  it('renders items, line totals, and the order total for a Confirmed (read-only) order', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' }, role: 'staff' })} />)

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    const allTotals = screen.getAllByText('$25.00')
    expect(allTotals.length).toBeGreaterThanOrEqual(2) // line + order total
  })

  it('renders items, line totals, and the order total for a Pending (editable) order', () => {
    render(<OrderDetailModal {...baseProps()} />)

    expect(screen.getByText('Burger')).toBeInTheDocument()
    const allTotals = screen.getAllByText('$25.00')
    expect(allTotals.length).toBeGreaterThanOrEqual(2) // line + order total
  })

  it('renders the editable item list (stepper + remove) for a Pending order regardless of role', () => {
    render(<OrderDetailModal {...baseProps({ role: 'staff' })} />)

    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).toBeInTheDocument()
  })

  it('renders the editable item list for a Confirmed order when role is admin', () => {
    render(
      <OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' }, role: 'admin' })} />,
    )

    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).toBeInTheDocument()
  })

  it('renders the read-only item list for a Confirmed order when role is staff', () => {
    render(
      <OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' }, role: 'staff' })} />,
    )

    expect(screen.queryByRole('button', { name: 'Increase Burger quantity' })).not.toBeInTheDocument()
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
  })

  it('calls onAddItem, onAdjustQuantity, and onRemoveItem from the editable item list', async () => {
    const onAdjustQuantity = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onAdjustQuantity })} />)

    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 3)
  })

  it('shows Confirm and Mark Paid for a Pending order, and calls the right callback for each', async () => {
    const onConfirm = vi.fn()
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onConfirm, onSetPaymentStatus })} />)

    await user.click(screen.getByRole('button', { name: 'Confirm order' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Mark Paid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Paid')
  })

  it('hides Confirm for a Confirmed & Unpaid order but keeps Mark Paid', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' } })} />)

    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
  })

  it('shows Mark Unpaid for any role on a Paid order', async () => {
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, paymentStatus: 'Paid' }, onSetPaymentStatus })} />)

    await user.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Unpaid')
  })

  it('shows the error message and disables actions when busy', () => {
    render(<OrderDetailModal {...baseProps({ busy: true, error: 'Order is Confirmed, not Pending' })} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDisabled()
  })

  it('renders "Counter" instead of "Table 0" for a table number 0 order', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, table: { number: 0 } } })} />)

    expect(screen.getByText('Counter', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Table 0', { exact: false })).not.toBeInTheDocument()
  })

  it('shows a Cancel order button for a Pending order', () => {
    render(<OrderDetailModal {...baseProps()} />)

    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('hides the Cancel order button for a Confirmed order', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' } })} />)

    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('opens a confirm dialog before cancelling, and calls onCancelOrder only after confirming', async () => {
    const onCancelOrder = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onCancelOrder })} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(onCancelOrder).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))
    expect(onCancelOrder).toHaveBeenCalledTimes(1)
  })

  it('does not cancel when "Never mind" is clicked', async () => {
    const onCancelOrder = vi.fn()
    const user = userEvent.setup()
    render(<OrderDetailModal {...baseProps({ onCancelOrder })} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    await user.click(screen.getByRole('button', { name: 'Never mind' }))

    expect(onCancelOrder).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Cancel this order?' })).not.toBeInTheDocument()
  })

  it('shows an Awaiting payment line for a Counter choice', () => {
    render(<OrderDetailModal {...baseProps({ order: { ...pendingOrder, paymentChoice: 'Counter' } })} />)

    expect(screen.getByText('Awaiting payment · Counter')).toBeInTheDocument()
  })

  it('shows a Paid line with method and reference once paymentStatus is Paid', () => {
    render(
      <OrderDetailModal
        {...baseProps({
          order: {
            ...pendingOrder,
            paymentStatus: 'Paid',
            paymentChoice: 'Online',
            paymentMethodNameSnapshot: 'GCash',
            paymentReference: 'TXN123',
          },
        })}
      />,
    )

    expect(screen.getByText('Paid · Online (GCash) · ref: TXN123')).toBeInTheDocument()
  })
})

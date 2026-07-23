import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTicketPane } from './OrderTicketPane'
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
  branchId: 'b1',
  branch: { name: 'Main' },
  orderingPoint: { label: 'Table 4' },
  items: [
    { id: 'i1', menuItemId: 'm1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
    { id: 'i2', menuItemId: 'm2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
  ],
}

function baseProps(overrides: Partial<React.ComponentProps<typeof OrderTicketPane>> = {}) {
  return {
    order: pendingOrder,
    editable: true,
    busy: false,
    settleBlockedByPendingAdd: false,
    error: null,
    onAdjustQuantity: vi.fn(),
    onRemoveItem: vi.fn(),
    onConfirm: vi.fn(),
    onCancelOrder: vi.fn(),
    onSetPaymentStatus: vi.fn(),
    onPrint: vi.fn(),
    ...overrides,
  }
}

describe('OrderTicketPane', () => {
  it('renders each line with its name, quantity, and price when editable', () => {
    render(<OrderTicketPane {...baseProps()} />)

    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
  })

  it('renders a read-only line list when not editable', () => {
    render(<OrderTicketPane {...baseProps({ editable: false })} />)

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Increase Burger quantity' })).not.toBeInTheDocument()
  })

  it('calls onAdjustQuantity with quantity+1/-1 when the stepper buttons are clicked', async () => {
    const onAdjustQuantity = vi.fn()
    const user = userEvent.setup()
    render(<OrderTicketPane {...baseProps({ onAdjustQuantity })} />)

    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 3)

    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 1)
  })

  it('disables the decrease button at quantity 1', () => {
    render(<OrderTicketPane {...baseProps({ order: { ...pendingOrder, items: [pendingOrder.items[1]] } })} />)

    expect(screen.getByRole('button', { name: 'Decrease Fries quantity' })).toBeDisabled()
  })

  it('hides the remove button for the only remaining line (INV-2)', () => {
    render(<OrderTicketPane {...baseProps({ order: { ...pendingOrder, items: [pendingOrder.items[0]] } })} />)

    expect(screen.queryByRole('button', { name: 'Remove Burger' })).not.toBeInTheDocument()
  })

  it('opens a confirm dialog before removing a line, and calls onRemoveItem only after confirming', async () => {
    const onRemoveItem = vi.fn()
    const user = userEvent.setup()
    render(<OrderTicketPane {...baseProps({ onRemoveItem })} />)

    await user.click(screen.getByRole('button', { name: 'Remove Fries' }))
    expect(onRemoveItem).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Remove item?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemoveItem).toHaveBeenCalledWith('i2')
  })

  it('shows Confirm and Mark Paid for a Pending order, and calls the right callback for each', async () => {
    const onConfirm = vi.fn()
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(<OrderTicketPane {...baseProps({ onConfirm, onSetPaymentStatus })} />)

    await user.click(screen.getByRole('button', { name: 'Confirm order' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Mark Paid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Paid')
  })

  it('hides Confirm for a Confirmed & Unpaid order but keeps Mark Paid', () => {
    render(<OrderTicketPane {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' } })} />)

    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
  })

  it('shows Mark Unpaid for any role on a Paid order', async () => {
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(<OrderTicketPane {...baseProps({ order: { ...pendingOrder, paymentStatus: 'Paid' }, onSetPaymentStatus })} />)

    await user.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Unpaid')
  })

  it('shows a Cancel order button for a Pending order, guarded by a confirm dialog', async () => {
    const onCancelOrder = vi.fn()
    const user = userEvent.setup()
    render(<OrderTicketPane {...baseProps({ onCancelOrder })} />)

    await user.click(screen.getByRole('button', { name: 'Cancel order' }))
    expect(onCancelOrder).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))
    expect(onCancelOrder).toHaveBeenCalledTimes(1)
  })

  it('hides the Cancel order button for a Confirmed order', () => {
    render(<OrderTicketPane {...baseProps({ order: { ...pendingOrder, fulfillmentStatus: 'Confirmed' } })} />)

    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('disables Print receipt with a hint when the order is Unpaid, and calls onPrint when Paid', async () => {
    const onPrint = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<OrderTicketPane {...baseProps({ onPrint })} />)

    const printButton = screen.getByRole('button', { name: 'Print receipt' })
    expect(printButton).toBeDisabled()
    expect(printButton).toHaveAttribute('title', 'Available once paid')

    rerender(<OrderTicketPane {...baseProps({ order: { ...pendingOrder, paymentStatus: 'Paid' }, onPrint })} />)
    const enabledPrintButton = screen.getByRole('button', { name: 'Print receipt' })
    expect(enabledPrintButton).not.toBeDisabled()

    await user.click(enabledPrintButton)
    expect(onPrint).toHaveBeenCalledTimes(1)
  })

  it('shows the error message when set', () => {
    render(<OrderTicketPane {...baseProps({ error: 'Order is Confirmed, not Pending' })} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
  })

  it('disables Confirm, Cancel, and Mark Paid when busy', () => {
    render(<OrderTicketPane {...baseProps({ busy: true })} />)

    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDisabled()
  })

  it('disables Confirm, Cancel, Mark Paid, and Print (once eligible) when settleBlockedByPendingAdd, without disabling steppers', () => {
    render(<OrderTicketPane {...baseProps({ order: { ...pendingOrder, paymentStatus: 'Paid' }, settleBlockedByPendingAdd: true })} />)

    expect(screen.getByRole('button', { name: 'Mark Unpaid' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Print receipt' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase Burger quantity' })).not.toBeDisabled()
  })

  it('does not disable Print via settleBlockedByPendingAdd beyond its existing Unpaid gate', () => {
    render(<OrderTicketPane {...baseProps({ settleBlockedByPendingAdd: false })} />)

    const printButton = screen.getByRole('button', { name: 'Print receipt' })
    expect(printButton).toBeDisabled()
    expect(printButton).toHaveAttribute('title', 'Available once paid')
  })
})

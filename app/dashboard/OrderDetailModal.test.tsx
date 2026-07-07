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
  customerName: 'Edward',
  table: { number: 4 },
  items: [{ id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 }],
}

describe('OrderDetailModal', () => {
  it('renders items, line totals, and the order total', () => {
    render(
      <OrderDetailModal
        order={pendingOrder}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    // Verify line total appears (first $25.00 in the list)
    const allTotals = screen.getAllByText('$25.00')
    expect(allTotals.length).toBeGreaterThanOrEqual(2) // line + order total
  })

  it('shows Confirm and Mark Paid for a Pending order, and calls the right callback for each', async () => {
    const onConfirm = vi.fn()
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderDetailModal
        order={pendingOrder}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={onConfirm}
        onSetPaymentStatus={onSetPaymentStatus}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm order' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Mark Paid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Paid')
  })

  it('hides Confirm for a Confirmed & Unpaid order but keeps Mark Paid', () => {
    render(
      <OrderDetailModal
        order={{ ...pendingOrder, fulfillmentStatus: 'Confirmed' }}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Confirm order' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument()
  })

  it('shows a static Paid badge (no revert button) for staff on a Paid order', () => {
    render(
      <OrderDetailModal
        order={{ ...pendingOrder, paymentStatus: 'Paid' }}
        role="staff"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark Unpaid' })).not.toBeInTheDocument()
  })

  it('lets an admin revert a Paid order to Unpaid', async () => {
    const onSetPaymentStatus = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderDetailModal
        order={{ ...pendingOrder, paymentStatus: 'Paid' }}
        role="admin"
        busy={false}
        error={null}
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={onSetPaymentStatus}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Mark Unpaid' }))
    expect(onSetPaymentStatus).toHaveBeenCalledWith('Unpaid')
  })

  it('shows the error message and disables actions when busy', () => {
    render(
      <OrderDetailModal
        order={pendingOrder}
        role="staff"
        busy={true}
        error="Order is Confirmed, not Pending"
        exiting={false}
        onConfirm={vi.fn()}
        onSetPaymentStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Order is Confirmed, not Pending')
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled()
  })
})

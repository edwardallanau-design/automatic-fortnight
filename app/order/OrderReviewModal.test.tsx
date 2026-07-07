import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderReviewModal } from './OrderReviewModal'

const lines = [
  { menuItemId: 'm1', name: 'Burger', price: '12.50', quantity: 2 },
  { menuItemId: 'm2', name: 'Fries', price: '4.00', quantity: 1 },
]

describe('OrderReviewModal', () => {
  it('renders every line with its quantity and line price, and the total', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('1x Fries')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
    expect(screen.getByText('$29.00')).toBeInTheDocument()
  })

  it('calls onClose when "Back to menu" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Back to menu' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when "Confirm Order" is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm Order' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click but not on a click inside the dialog content', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('review-modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables both action buttons while submitting', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={true}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Back to menu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Confirm Order' })).toBeDisabled()
  })

  it('renders the error message when present', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error="Burger is no longer available"
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Burger is no longer available')
  })

  it('adds an exiting class to the dialog when exiting is true', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={true}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveClass('review-modal--exiting')
  })

  it('renders the name input with its current value and the nudge text', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName="Edward"
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Name for this order')).toHaveValue('Edward')
    expect(screen.getByText('Add a name so we can find you')).toBeInTheDocument()
  })

  it('reports name edits through onCustomerNameChange', async () => {
    const onCustomerNameChange = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={false}
        exiting={false}
        customerName=""
        onCustomerNameChange={onCustomerNameChange}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Name for this order'), 'E')
    expect(onCustomerNameChange).toHaveBeenCalledWith('E')
  })

  it('disables the name input while submitting', () => {
    render(
      <OrderReviewModal
        lines={lines}
        total={29}
        error={null}
        submitting={true}
        exiting={false}
        customerName=""
        onCustomerNameChange={vi.fn()}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Name for this order')).toBeDisabled()
  })
})

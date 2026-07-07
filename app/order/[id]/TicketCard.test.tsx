import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TicketCard } from './TicketCard'

const items = [
  { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 1 },
  { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 2 },
]

describe('TicketCard', () => {
  it('renders the heading, each line, and the total', () => {
    render(<TicketCard heading="Order #47 confirmed" customerName={null} items={items} statusNote="Note text" />)

    expect(screen.getByText('Order #47 confirmed')).toBeInTheDocument()
    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('x1')).toBeInTheDocument()
    expect(screen.getByText('$12.50')).toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
    expect(screen.getByText('x2')).toBeInTheDocument()
    expect(screen.getByText('$8.00')).toBeInTheDocument()
    expect(screen.getByText('$20.50')).toBeInTheDocument()
    expect(screen.getByText('Note text')).toBeInTheDocument()
  })

  it('shows the customer name when provided', () => {
    render(<TicketCard heading="Order #47" customerName="Edward" items={items} statusNote="Note" />)
    expect(screen.getByText('For Edward')).toBeInTheDocument()
  })

  it('renders no name line when customerName is null', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note" />)
    expect(screen.queryByText(/^For /)).not.toBeInTheDocument()
  })

  it('does not render a remove button for lines with no onRemove', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders a remove button for lines with onRemove and calls it on click', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={[{ ...items[0], onRemove }]}
        statusNote="Note"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Burger' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('disables remove buttons when busy', () => {
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={[{ ...items[0], onRemove: vi.fn() }]}
        statusNote="Note"
        busy
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove Burger' })).toBeDisabled()
  })

  it('renders footer content between the total and the status note', () => {
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={items}
        statusNote="Note text"
        footer={<button type="button">Cancel order</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TicketCard, formatPaymentChoiceNote } from './TicketCard'

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

  it('never renders a remove button for any line', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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

  it('renders the paymentNote between the footer and the status note when provided', () => {
    render(
      <TicketCard
        heading="Order #47"
        customerName={null}
        items={items}
        statusNote="Note text"
        paymentNote="You chose to pay at the counter."
      />,
    )
    expect(screen.getByText('You chose to pay at the counter.')).toBeInTheDocument()
  })

  it('renders nothing extra when paymentNote is null', () => {
    render(<TicketCard heading="Order #47" customerName={null} items={items} statusNote="Note text" paymentNote={null} />)
    expect(screen.queryByText(/chose to pay/)).not.toBeInTheDocument()
  })
})

describe('formatPaymentChoiceNote', () => {
  it('returns a counter note', () => {
    expect(formatPaymentChoiceNote('Counter', null, null)).toBe('You chose to pay at the counter.')
  })

  it('returns an online note with method and reference', () => {
    expect(formatPaymentChoiceNote('Online', 'GCash', 'TXN123')).toBe(
      'You chose to pay online via GCash. Reference: TXN123.',
    )
  })

  it('returns null when no choice has been made', () => {
    expect(formatPaymentChoiceNote('None', null, null)).toBeNull()
  })
})

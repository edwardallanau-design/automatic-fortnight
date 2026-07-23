import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Receipt } from './Receipt'

const baseItems = [
  { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
  { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
]

describe('Receipt', () => {
  it('renders branch, ordering point, order number, and every item line with its price', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText(/Table 4/)).toBeInTheDocument()
    expect(screen.getByText(/#101/)).toBeInTheDocument()
    expect(screen.getByText('2x Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('1x Fries')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
  })

  it('renders the total as the sum of all line prices', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByText('$29.00')).toBeInTheDocument()
  })

  it('omits the customer-name line when customerName is null', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.queryByTestId('receipt-customer-name')).not.toBeInTheDocument()
  })

  it('renders the customer name when set', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName="Edward"
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByTestId('receipt-customer-name')).toHaveTextContent('Edward')
  })

  it('renders a Counter payment line', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Counter"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByText(/PAID/)).toBeInTheDocument()
    expect(screen.getByText(/Paid at the counter/)).toBeInTheDocument()
  })

  it('renders an Online payment line with method and reference', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="Online"
        paymentMethodNameSnapshot="GCash"
        paymentReference="REF123"
      />,
    )

    expect(screen.getByText(/Paid online via GCash/)).toBeInTheDocument()
    expect(screen.getByText(/REF123/)).toBeInTheDocument()
  })

  it('renders a plain PAID line with no channel claim when paymentChoice is None', () => {
    render(
      <Receipt
        branchName="Main"
        orderingPointLabel="Table 4"
        orderNumber={101}
        customerName={null}
        items={baseItems}
        paymentChoice="None"
        paymentMethodNameSnapshot={null}
        paymentReference={null}
      />,
    )

    expect(screen.getByText('PAID')).toBeInTheDocument()
    expect(screen.queryByText(/counter/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/online/i)).not.toBeInTheDocument()
  })
})

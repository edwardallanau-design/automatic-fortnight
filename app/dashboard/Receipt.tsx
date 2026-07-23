export type ReceiptItem = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type ReceiptPaymentChoice = 'None' | 'Counter' | 'Online'

function lineTotal(item: ReceiptItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

function formatPaidLine(
  paymentChoice: ReceiptPaymentChoice,
  paymentMethodNameSnapshot: string | null,
  paymentReference: string | null,
): string {
  if (paymentChoice === 'Online') {
    return `PAID — Paid online via ${paymentMethodNameSnapshot}. Reference: ${paymentReference}.`
  }
  if (paymentChoice === 'Counter') {
    return 'PAID — Paid at the counter.'
  }
  return 'PAID'
}

export function Receipt({
  branchName,
  orderingPointLabel,
  orderNumber,
  customerName,
  items,
  paymentChoice,
  paymentMethodNameSnapshot,
  paymentReference,
}: {
  branchName: string
  orderingPointLabel: string
  orderNumber: number
  customerName: string | null
  items: ReceiptItem[]
  paymentChoice: ReceiptPaymentChoice
  paymentMethodNameSnapshot: string | null
  paymentReference: string | null
}) {
  const total = items.reduce((sum, item) => sum + lineTotal(item), 0)

  return (
    <section className="receipt" aria-label="Receipt" aria-hidden="true">
      <p className="receipt__branch">{branchName}</p>
      <p className="receipt__heading">
        {orderingPointLabel} · #{orderNumber}
      </p>
      {customerName && (
        <p className="receipt__customer" data-testid="receipt-customer-name">
          {customerName}
        </p>
      )}
      <ul className="receipt__lines">
        {items.map((item) => (
          <li key={item.id} className="receipt__line">
            <span className="receipt__line-name">
              {item.quantity}x {item.nameSnapshot}
            </span>
            <span className="receipt__line-price">${lineTotal(item).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <div className="receipt__total">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
      <p className="receipt__payment">{formatPaidLine(paymentChoice, paymentMethodNameSnapshot, paymentReference)}</p>
    </section>
  )
}

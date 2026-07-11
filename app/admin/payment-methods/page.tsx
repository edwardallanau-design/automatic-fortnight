import { requireRole } from '@/lib/authGuard'
import { listPaymentMethods } from '@/lib/paymentMethodService'
import { CreatePaymentMethodForm } from './CreatePaymentMethodForm'
import { PaymentMethodRow } from './PaymentMethodRow'

export default async function AdminPaymentMethodsPage() {
  await requireRole('admin')

  const methods = await listPaymentMethods()

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Payment Methods</h1>
      </header>
      <div className="admin-panel">
        <CreatePaymentMethodForm />
      </div>
      {methods.length === 0 ? (
        <p className="admin-empty">No payment methods yet — add one above.</p>
      ) : (
        <ul className="payment-method-admin-list">
          {methods.map((method) => (
            <PaymentMethodRow
              key={method.id}
              id={method.id}
              name={method.name}
              accountInfo={method.accountInfo}
              qrImageUrl={method.qrImageUrl}
              active={method.active}
              editable
            />
          ))}
        </ul>
      )}
    </main>
  )
}

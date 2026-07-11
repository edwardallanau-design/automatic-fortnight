import { requireRole } from '@/lib/authGuard'
import { listBranches } from '@/lib/branchService'
import { CreateBranchForm } from './CreateBranchForm'
import { BranchRow } from './BranchRow'

export default async function AdminBranchesPage() {
  await requireRole('admin')

  const branches = await listBranches()

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Branches</h1>
      </header>
      <div className="admin-panel">
        <CreateBranchForm />
      </div>
      {branches.length === 0 ? (
        <p className="admin-empty">No branches yet — add one above.</p>
      ) : (
        <ul className="branch-list">
          {branches.map((branch) => (
            <BranchRow key={branch.id} id={branch.id} name={branch.name} acceptingOrders={branch.acceptingOrders} />
          ))}
        </ul>
      )}
    </main>
  )
}

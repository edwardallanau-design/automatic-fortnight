'use client'

import { useRouter, usePathname } from 'next/navigation'

type BranchSelectorProps = {
  branches: { id: string; name: string }[]
  selectedBranchId: string
}

export function BranchSelector({ branches, selectedBranchId }: BranchSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`${pathname}?branch=${e.target.value}`)
  }

  return (
    <label className="branch-selector">
      <span className="admin-panel__label">Branch</span>
      <select
        className="admin-panel__input branch-selector__select"
        value={selectedBranchId}
        onChange={handleChange}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  )
}

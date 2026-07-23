'use client'

import { useState } from 'react'
import { groupByCategory } from '@/lib/groupByCategory'
import { MenuGroups } from '@/app/components/MenuGroups'
import { MenuItemCard } from './MenuItemCard'
import { CategoryHeader } from './CategoryHeader'
import { AddItemRow } from './AddItemRow'
import { AddCategoryRow } from './AddCategoryRow'
import { CategoryReorder } from './CategoryReorder'

type Category = { id: string; name: string; sortOrder: number }
type ManagedItem = {
  id: string
  name: string
  price: string
  available: boolean
  category: Category | null
}

export function MenuManager({
  items,
  categories,
  branchId,
  isAdmin,
}: {
  items: ManagedItem[]
  categories: Category[]
  branchId: string
  isAdmin: boolean
}) {
  const [reordering, setReordering] = useState(false)
  // Admin sees empty categories too (so a freshly-created or emptied category is
  // still visible + addable); the customer view drops them (Cart, Task 4).
  const groups = groupByCategory(items, categories, { includeEmptyCategories: isAdmin })
  const selectCategories = categories.map((c) => ({ id: c.id, name: c.name }))
  const canReorder = isAdmin && categories.length > 1

  if (reordering) {
    return (
      <CategoryReorder
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        onClose={() => setReordering(false)}
      />
    )
  }

  return (
    <>
      {canReorder && (
        <div className="menu-manager__toolbar">
          <button type="button" className="menu-manager__reorder" onClick={() => setReordering(true)}>
            Reorder categories
          </button>
        </div>
      )}
      <MenuGroups<ManagedItem>
        groups={groups}
        renderHeading={(group) =>
          group.id === 'uncategorized' ? (
            <h2 className="menu-category__title">Uncategorized</h2>
          ) : (
            <CategoryHeader id={group.id} name={group.name} interactive={isAdmin} />
          )
        }
        renderItem={(item) => (
          <MenuItemCard
            id={item.id}
            name={item.name}
            price={item.price}
            available={item.available}
            editable={isAdmin}
            branchId={branchId}
            categoryId={item.category?.id ?? null}
            categories={selectCategories}
          />
        )}
        renderGroupFooter={
          isAdmin
            ? (group) => <AddItemRow categoryId={group.id === 'uncategorized' ? null : group.id} />
            : undefined
        }
        footer={isAdmin ? <AddCategoryRow /> : undefined}
      />
    </>
  )
}

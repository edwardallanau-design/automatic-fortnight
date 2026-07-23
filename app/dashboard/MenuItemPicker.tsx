'use client'

import { MenuGroups } from '@/app/components/MenuGroups'

export type PickerItem = {
  id: string
  name: string
  price: string
  available: boolean
  countOnOrder: number
}

export function MenuItemPicker({
  groups,
  disabled,
  onAdd,
}: {
  groups: Array<{ id: string; name: string; items: PickerItem[] }>
  disabled: boolean
  onAdd: (menuItemId: string) => void
}) {
  return (
    <div className="order-detail-picker">
      <MenuGroups
        groups={groups}
        renderHeading={(group) => (
          <h2 className="menu-category__title">{group.id === 'uncategorized' ? 'Other' : group.name}</h2>
        )}
        renderItem={(item) => (
          <button
            type="button"
            className="menu-item-button"
            disabled={disabled || !item.available}
            onClick={() => onAdd(item.id)}
          >
            <span className="menu-item-button__name-wrap">
              <span className="menu-item-button__name">{item.name}</span>
              {!item.available && <span className="menu-item-button__sold-out">Sold out</span>}
            </span>
            {/* Always rendered (even blank) so it occupies a fixed grid column on every row --
                conditionally rendering this span shifted the price left/right depending on
                whether a count was present. */}
            <span className="menu-item-button__count">{item.countOnOrder > 0 ? item.countOnOrder : null}</span>
            <span className="menu-item-button__price">${item.price}</span>
          </button>
        )}
      />
    </div>
  )
}

import type { ReactNode } from 'react'

export type MenuGroup<T> = { id: string; name: string; items: T[] }

type MenuGroupsProps<T> = {
  groups: Array<MenuGroup<T>>
  renderHeading: (group: { id: string; name: string }) => ReactNode
  renderItem: (item: T, index: number) => ReactNode
  renderGroupFooter?: (group: { id: string; name: string }) => ReactNode
  footer?: ReactNode
}

export function MenuGroups<T extends { id: string }>({
  groups,
  renderHeading,
  renderItem,
  renderGroupFooter,
  footer,
}: MenuGroupsProps<T>) {
  return (
    <div className="menu-categories">
      {groups.map((group) => (
        <div key={group.id} className="menu-category">
          {renderHeading({ id: group.id, name: group.name })}
          <ul className="menu-list">
            {group.items.map((item, index) => (
              <li key={item.id}>{renderItem(item, index)}</li>
            ))}
          </ul>
          {renderGroupFooter?.({ id: group.id, name: group.name })}
        </div>
      ))}
      {footer}
    </div>
  )
}

export type CategoryRef = { id: string; name: string; sortOrder: number }

export function groupByCategory<T extends { category: CategoryRef | null }>(
  items: T[],
  categories: CategoryRef[],
  options: { includeEmptyCategories?: boolean } = {},
): Array<{ id: string; name: string; items: T[] }> {
  const byCategoryId = new Map<string, T[]>()
  const uncategorized: T[] = []
  for (const item of items) {
    if (item.category) {
      const group = byCategoryId.get(item.category.id) ?? []
      group.push(item)
      byCategoryId.set(item.category.id, group)
    } else {
      uncategorized.push(item)
    }
  }
  const groups = categories
    .map((category) => ({ id: category.id, name: category.name, items: byCategoryId.get(category.id) ?? [] }))
    .filter((group) => options.includeEmptyCategories || group.items.length > 0)
  if (uncategorized.length > 0) {
    groups.push({ id: 'uncategorized', name: 'Uncategorized', items: uncategorized })
  }
  return groups
}

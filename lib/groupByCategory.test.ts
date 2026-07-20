import { describe, it, expect } from 'vitest'
import { groupByCategory } from './groupByCategory'

const cats = [
  { id: 'c1', name: 'Mains', sortOrder: 0 },
  { id: 'c2', name: 'Drinks', sortOrder: 1 },
]

function item(id: string, category: { id: string; name: string; sortOrder: number } | null) {
  return { id, category }
}

describe('groupByCategory', () => {
  it('groups items under their category, in the given category order', () => {
    const result = groupByCategory(
      [item('m1', cats[1]), item('m2', cats[0])],
      cats,
    )
    expect(result.map((g) => g.name)).toEqual(['Mains', 'Drinks'])
    expect(result[0].items.map((i) => i.id)).toEqual(['m2'])
    expect(result[1].items.map((i) => i.id)).toEqual(['m1'])
  })

  it('omits categories with no items', () => {
    const result = groupByCategory([item('m1', cats[0])], cats)
    expect(result.map((g) => g.name)).toEqual(['Mains'])
  })

  it('appends an Uncategorized group last, only when uncategorized items exist', () => {
    const result = groupByCategory([item('m1', cats[0]), item('m2', null)], cats)
    expect(result.map((g) => g.name)).toEqual(['Mains', 'Uncategorized'])
    expect(result[result.length - 1].id).toBe('uncategorized')
  })

  it('does not append an Uncategorized group when every item has a category', () => {
    const result = groupByCategory([item('m1', cats[0])], cats)
    expect(result.some((g) => g.id === 'uncategorized')).toBe(false)
  })

  it('returns an empty array when there are no items', () => {
    expect(groupByCategory([], cats)).toEqual([])
  })

  it('keeps empty categories when includeEmptyCategories is set (admin view)', () => {
    const result = groupByCategory([item('m1', cats[0])], cats, { includeEmptyCategories: true })
    expect(result.map((g) => g.name)).toEqual(['Mains', 'Drinks'])
    expect(result[1].items).toEqual([])
  })

  it('with includeEmptyCategories, still omits an empty uncategorized group', () => {
    const result = groupByCategory([], cats, { includeEmptyCategories: true })
    expect(result.map((g) => g.id)).toEqual(['c1', 'c2'])
    expect(result.some((g) => g.id === 'uncategorized')).toBe(false)
  })
})

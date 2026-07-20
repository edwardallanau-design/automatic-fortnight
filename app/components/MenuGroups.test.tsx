import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MenuGroups } from './MenuGroups'

type Item = { id: string; name: string }

const groups = [
  { id: 'c1', name: 'Mains', items: [{ id: 'm1', name: 'Burger' }] as Item[] },
  { id: 'uncategorized', name: 'Uncategorized', items: [{ id: 'm2', name: 'Mystery' }] as Item[] },
]

function renderBasic(extra?: Partial<React.ComponentProps<typeof MenuGroups<Item>>>) {
  return render(
    <MenuGroups<Item>
      groups={groups}
      renderHeading={(g) => <h2>{g.id === 'uncategorized' ? 'Other' : g.name}</h2>}
      renderItem={(item) => <span>{item.name}</span>}
      {...extra}
    />,
  )
}

describe('MenuGroups', () => {
  it('renders a heading per group in order, via renderHeading', () => {
    renderBasic()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Mains', 'Other'])
  })

  it('renders each group\'s items via renderItem inside a list', () => {
    renderBasic()
    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('Mystery')).toBeInTheDocument()
  })

  it('passes the within-group index to renderItem', () => {
    render(
      <MenuGroups<Item>
        groups={[{ id: 'c1', name: 'Mains', items: [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }] }]}
        renderHeading={(g) => <h2>{g.name}</h2>}
        renderItem={(item, index) => <span>{`${item.name}:${index}`}</span>}
      />,
    )
    expect(screen.getByText('A:0')).toBeInTheDocument()
    expect(screen.getByText('B:1')).toBeInTheDocument()
  })

  it('renders renderGroupFooter after each group\'s items when provided', () => {
    renderBasic({ renderGroupFooter: (g) => <button>{`add-to-${g.id}`}</button> })
    expect(screen.getByRole('button', { name: 'add-to-c1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'add-to-uncategorized' })).toBeInTheDocument()
  })

  it('renders the page-level footer once, after all groups', () => {
    renderBasic({ footer: <button>add-category</button> })
    expect(screen.getByRole('button', { name: 'add-category' })).toBeInTheDocument()
  })

  it('does not render group footers when renderGroupFooter is omitted', () => {
    const { container } = renderBasic()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})

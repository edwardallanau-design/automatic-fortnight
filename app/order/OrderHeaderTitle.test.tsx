import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrderHeaderTitle } from './OrderHeaderTitle'

describe('OrderHeaderTitle', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('renders only the table number when no name is stored', () => {
    render(<OrderHeaderTitle tableId="t1" tableNumber={5} />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Table 5')
    expect(heading.textContent).not.toContain('·')
  })

  it('appends the stored name for this table', () => {
    sessionStorage.setItem('orderName:t1', 'Edward')
    render(<OrderHeaderTitle tableId="t1" tableNumber={5} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Table 5 · Edward')
  })

  it('ignores names stored for other tables', () => {
    sessionStorage.setItem('orderName:t2', 'Edward')
    render(<OrderHeaderTitle tableId="t1" tableNumber={5} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('Edward')
  })
})

import { describe, it, expect } from 'vitest'
import { formatTableLabel } from './tableDisplay'

describe('formatTableLabel', () => {
  it('renders table number 0 as "Counter"', () => {
    expect(formatTableLabel(0)).toBe('Counter')
  })

  it('renders any other table number as "Table N"', () => {
    expect(formatTableLabel(4)).toBe('Table 4')
    expect(formatTableLabel(12)).toBe('Table 12')
  })
})

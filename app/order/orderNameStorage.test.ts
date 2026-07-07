import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readOrderName, saveOrderName } from './orderNameStorage'

describe('orderNameStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips a saved name for a table', () => {
    saveOrderName('t1', 'Edward')
    expect(readOrderName('t1')).toBe('Edward')
  })

  it('returns null when no name is saved', () => {
    expect(readOrderName('t1')).toBeNull()
  })

  it('keeps names isolated per table', () => {
    saveOrderName('t1', 'Edward')
    expect(readOrderName('t2')).toBeNull()
  })

  it('returns null instead of throwing when storage is inaccessible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readOrderName('t1')).toBeNull()
  })

  it('does not throw when saving to inaccessible storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveOrderName('t1', 'Edward')).not.toThrow()
  })
})

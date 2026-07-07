import '@testing-library/jest-dom/vitest'

// Polyfill sessionStorage for node environment tests
if (typeof sessionStorage === 'undefined') {
  const store: Record<string, string> = {}

  class StorageImpl implements Storage {
    getItem(key: string): string | null {
      return store[key] || null
    }

    setItem(key: string, value: string): void {
      store[key] = value
    }

    removeItem(key: string): void {
      delete store[key]
    }

    clear(): void {
      Object.keys(store).forEach((key) => delete store[key])
    }

    key(index: number): string | null {
      return null
    }

    get length(): number {
      return Object.keys(store).length
    }
  }

  global.sessionStorage = new StorageImpl()
  global.Storage = StorageImpl as any
}

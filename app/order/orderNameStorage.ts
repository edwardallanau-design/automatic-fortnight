const KEY_PREFIX = 'orderName:'

export function readOrderName(tableId: string): string | null {
  try {
    return sessionStorage.getItem(KEY_PREFIX + tableId)
  } catch {
    return null
  }
}

export function saveOrderName(tableId: string, name: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + tableId, name)
  } catch {
    // Inaccessible storage — skip persistence, matching the cart's behavior.
  }
}

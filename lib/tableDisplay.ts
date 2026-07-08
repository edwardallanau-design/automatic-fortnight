export function formatTableLabel(number: number): string {
  return number === 0 ? 'Counter' : `Table ${number}`
}

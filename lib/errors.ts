export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ValidationError extends DomainError {}
export class NotFoundError extends DomainError {}
export class ConflictError extends DomainError {}
// A ConflictError specifically because the menu item is sold out in the order's branch, distinct
// from other 409s on the same routes (e.g. INV-16's "order is marked Paid"). Clients that want to
// react to sold-out-ness specifically (greying out the item) must check for this, not the generic
// CONFLICT code -- see ISSUE-28's follow-up in ISSUES.md for why conflating them is a real bug.
export class SoldOutError extends ConflictError {}
export class ForbiddenError extends DomainError {}
export class InvalidCredentialError extends DomainError {}

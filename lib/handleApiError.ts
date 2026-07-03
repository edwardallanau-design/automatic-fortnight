import { NextResponse } from 'next/server'
import {
  DomainError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  InvalidCredentialError,
} from './errors'

function statusFor(error: DomainError): number {
  if (error instanceof ValidationError) return 400
  if (error instanceof InvalidCredentialError) return 401
  if (error instanceof ForbiddenError) return 403
  if (error instanceof NotFoundError) return 404
  if (error instanceof ConflictError) return 409
  return 500
}

function codeFor(error: DomainError): string {
  return error.name
    .replace(/Error$/, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json(
      { error: codeFor(error), message: error.message },
      { status: statusFor(error) },
    )
  }

  console.error(JSON.stringify({ level: 'error', message: String(error) }))
  return NextResponse.json(
    { error: 'INTERNAL_ERROR', message: 'Something went wrong' },
    { status: 500 },
  )
}

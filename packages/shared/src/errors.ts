/**
 * Error codes shared by the API and the web app (section 9.1, section 11).
 * The wire format is { error: { code, message } }.
 */

export const ERROR_CODES = [
  'NOT_FOUND',
  'VALIDATION',
  'BUDGET_EXHAUSTED',
  'PROVIDER_DOWN',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  BUDGET_EXHAUSTED: 429,
  PROVIDER_DOWN: 502,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  NOT_FOUND: 'That resource does not exist.',
  VALIDATION: 'The request did not pass validation.',
  BUDGET_EXHAUSTED: 'The monthly provider budget is used up. Saved data is still served.',
  PROVIDER_DOWN: 'The provider is not reachable right now.',
  UNAUTHORIZED: 'A valid admin token is required.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  INTERNAL: 'Something went wrong on our side.',
};

/** One error class for the whole repository, so codes are never retyped. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

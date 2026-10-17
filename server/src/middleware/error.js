// Centralized error handling — consistent JSON error shape (NFR: Reliability)

export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

/**
 * Drizzle wraps every driver failure in a `DrizzleQueryError` and puts the
 * original `pg` error on `cause` — the SQLSTATE code we care about lives there.
 */
function driverError(err) {
  const cause = err?.cause;
  if (cause && typeof cause.code === 'string' && /^\d{5}$/.test(cause.code)) return cause;
  return err ?? {};
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  // PostgreSQL constraint violations (SQLSTATE class 23)
  const { code } = driverError(err);
  if (code === '23505') {
    return res.status(409).json({ error: 'A record with that unique value already exists' });
  }
  if (code === '23503') {
    return res.status(409).json({ error: 'The record is still referenced by other records' });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error', details: err.details });
}

// Wrap async controllers so thrown errors reach errorHandler
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

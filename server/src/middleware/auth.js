import jwt from 'jsonwebtoken';
import { ApiError } from './error.js';

// FR-1.2 — verify "Authorization: Bearer <token>"
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required'));

  try {
    // payload: { id, role, name }
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}

// FR-1.3 — role-based route guard. Usage: requireRole('ADMIN', 'AGENT')
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
}

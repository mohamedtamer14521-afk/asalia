const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'asalia_default_jwt_secret_dev_key';

/**
 * Generate a signed JWT for an authenticated user (30 days default for seamless sessions)
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

/**
 * Set HTTP-only auth cookie on the response (30 days)
 */
function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('asalia_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
}

/**
 * Clear the auth cookie on logout
 */
function clearAuthCookie(res) {
  res.clearCookie('asalia_token', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });
}

/**
 * Authenticate incoming requests via HTTP-only cookie or Authorization header
 */
async function authenticate(req, res, next) {
  let token = null;

  if (req.cookies && req.cookies.asalia_token) {
    token = req.cookies.asalia_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please log in.'
      }
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user exists and is active in database
    const userRes = await db.query(
      'SELECT id, username, email, role, balance, is_active, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User account no longer exists.' }
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      clearAuthCookie(res);
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended by administration.' }
      });
    }

    req.user = user;
    next();
  } catch (err) {
    clearAuthCookie(res);
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Session expired or invalid. Please log in again.' }
    });
  }
}

/**
 * Middleware to restrict access to ADMIN users only (Super Admin)
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access restricted to platform Super Administrators (ADMIN).'
      }
    });
  }
  next();
}

/**
 * Middleware to restrict access to Operations Managers or Super Admins
 */
function requireManager(req, res, next) {
  if (!req.user || !['ADMIN', 'MANAGER'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access restricted to Operations Managers or Administrators.'
      }
    });
  }
  next();
}

/**
 * Middleware to restrict access to Staff (ADMIN, MANAGER, SUPPORT)
 */
function requireStaff(req, res, next) {
  if (!req.user || !['ADMIN', 'MANAGER', 'SUPPORT'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access restricted to platform staff members.'
      }
    });
  }
  next();
}

/**
 * Flexible role authorization middleware factory
 * @param {string[]} allowedRoles - Array of allowed roles, e.g. ['ADMIN', 'MANAGER']
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access requires one of the following roles: ${allowedRoles.join(', ')}`
        }
      });
    }
    next();
  };
}

/**
 * Optional authentication middleware for public endpoints that can enrich with user data
 */
async function optionalAuth(req, res, next) {
  let token = null;
  if (req.cookies && req.cookies.asalia_token) {
    token = req.cookies.asalia_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userRes = await db.query(
      'SELECT id, username, email, role, balance, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    if (userRes.rows.length > 0 && userRes.rows[0].is_active) {
      req.user = userRes.rows[0];
    }
  } catch (e) {
    // Ignore invalid optional tokens
  }
  next();
}

module.exports = {
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  authenticate,
  requireAdmin,
  requireManager,
  requireStaff,
  requireRole,
  optionalAuth
};

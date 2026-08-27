const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'asalia_default_jwt_secret_dev_key';

/**
 * Generate a signed JWT for an authenticated user
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
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * Set HTTP-only auth cookie on the response
 */
function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('asalia_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

/**
 * Clear the auth cookie on logout
 */
function clearAuthCookie(res) {
  res.clearCookie('asalia_token', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
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
 * Middleware to restrict access to ADMIN users only
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access restricted to platform administrators.'
      }
    });
  }
  next();
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
  optionalAuth
};

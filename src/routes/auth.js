const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { generateToken, setAuthCookie, clearAuthCookie, authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Input sanitization and validators
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Username, email, and password are required.' }
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!USERNAME_REGEX.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_USERNAME',
          message: 'Username must be 3-30 alphanumeric characters or underscores.'
        }
      });
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Please provide a valid email address.' }
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters long.' }
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'PASSWORDS_DO_NOT_MATCH', message: 'Passwords do not match.' }
      });
    }

    // Check if registrations are open
    const regSetting = await db.query("SELECT value FROM settings WHERE key = 'registration_enabled'");
    if (regSetting.rows.length > 0 && regSetting.rows[0].value === 'false') {
      return res.status(403).json({
        success: false,
        error: { code: 'REGISTRATION_CLOSED', message: 'Public registration is currently disabled.' }
      });
    }

    // Check for existing username or email
    const existing = await db.query(
      'SELECT username, email FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2',
      [cleanUsername, cleanEmail]
    );

    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.username.toLowerCase() === cleanUsername) {
        return res.status(409).json({
          success: false,
          error: { code: 'USERNAME_TAKEN', message: 'This username is already taken.' }
        });
      }
      return res.status(409).json({
        success: false,
        error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' }
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertRes = await db.query(
      `INSERT INTO users (username, email, password_hash, role, balance, is_active)
       VALUES ($1, $2, $3, 'CUSTOMER', 0.0000, true)
       RETURNING id, username, email, role, balance, created_at`,
      [cleanUsername, cleanEmail, passwordHash]
    );

    const newUser = insertRes.rows[0];
    const token = generateToken(newUser);
    setAuthCookie(res, token);

    // Initial welcome notification
    await db.query(
      `INSERT INTO notifications (user_id, title_en, title_ar, message_en, message_ar, type)
       VALUES ($1, $2, $3, $4, $5, 'welcome')`,
      [
        newUser.id,
        'Welcome to ASALIA',
        'مرحباً بك في أصالة',
        'Your account has been created. Add funds to get started with social media services.',
        'تم إنشاء حسابك بنجاح. أضف رصيداً للبدء في طلب الخدمات.'
      ]
    );

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          balance: Number(newUser.balance)
        },
        token
      }
    });
  } catch (err) {
    console.error('[AUTH REGISTER ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred during registration.' }
    });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CREDENTIALS', message: 'Username/email and password are required.' }
      });
    }

    const cleanLogin = login.trim().toLowerCase();

    // Query user by username or email
    const userRes = await db.query(
      'SELECT id, username, email, password_hash, role, balance, is_active FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1',
      [cleanLogin]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username/email or password.' }
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended by administration.' }
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username/email or password.' }
      });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    // Audit log if admin login
    if (user.role === 'ADMIN') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      await db.query(
        `INSERT INTO admin_logs (admin_id, action, target_type, target_id, ip_address)
         VALUES ($1, 'LOGIN', 'AUTH', $2, $3)`,
        [user.id, String(user.id), String(ip).substring(0, 45)]
      );
    }

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          balance: Number(user.balance)
        },
        token
      }
    });
  } catch (err) {
    console.error('[AUTH LOGIN ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred during login.' }
    });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({
    success: true,
    data: { message: 'Logged out successfully.' }
  });
});

/**
 * GET /api/me
 */
router.get('/me', authenticate, async (req, res) => {
  // Returns fresh customer data from PostgreSQL
  const userRes = await db.query(
    'SELECT id, username, email, role, balance, is_active, created_at FROM users WHERE id = $1',
    [req.user.id]
  );

  if (userRes.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    });
  }

  const user = userRes.rows[0];
  return res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: Number(user.balance),
        created_at: user.created_at
      }
    }
  });
});

module.exports = router;

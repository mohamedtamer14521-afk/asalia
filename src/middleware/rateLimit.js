const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again in 15 minutes.'
    }
  }
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // max 30 orders per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Order submission rate limit exceeded. Please wait a moment before submitting again.'
    }
  }
});

const depositLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many deposit submissions. Please wait before submitting more payment proofs.'
    }
  }
});

module.exports = {
  authLimiter,
  orderLimiter,
  depositLimiter
};

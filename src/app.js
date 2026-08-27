const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');

const app = express();

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false // Allows scripts, fonts, and inline styles in our vanilla frontend
}));

// Cross-Origin Resource Sharing
app.use(cors({
  origin: true,
  credentials: true
}));

// Body & Cookie Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve Static Frontend Assets & Uploads
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

const isVercel = Boolean(process.env.VERCEL);
const uploadsDir = isVercel
  ? path.join(require('os').tmpdir(), 'uploads')
  : path.join(__dirname, '..', 'uploads');

try {
  if (fs.existsSync(uploadsDir)) {
    app.use('/uploads', express.static(uploadsDir));
  }
} catch (e) {}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// Mount Routes
const serviceRoutes = require('./routes/services');
const orderRoutes = require('./routes/orders');
const depositRoutes = require('./routes/deposits');
const walletRoutes = require('./routes/wallet');
const dashboardRoutes = require('./routes/dashboard');
const ticketRoutes = require('./routes/tickets');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');

// Mount All Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// 404 Handler for API endpoints
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'ENDPOINT_NOT_FOUND', message: `Route ${req.originalUrl} does not exist.` }
  });
});

// Single Page Fallback for HTML routing
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(publicDir, 'app.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please contact support.'
        : err.message
    }
  });
});

module.exports = app;

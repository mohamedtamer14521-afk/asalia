# ASALIA — Production SMM Order & Manual Fulfillment Platform

**ASALIA (أصالة)** is a production-ready Social Media Marketing (SMM) platform built for manual order fulfillment, authoritative financial accounting, and WhatsApp-assisted customer workflows.

Built with **Node.js**, **PostgreSQL**, **HTML5**, **CSS3**, and **Vanilla JavaScript**, the system is designed to deploy seamlessly to **Vercel Serverless** while guaranteeing ACID financial transactions, row locking, and persistent external screenshot storage.

---

## 🌟 Key Architectural Pillars

1. **Absolute Financial Integrity**:
   - Every financial mutation (`DEPOSIT`, `ORDER_CHARGE`, `REFUND`, `MANUAL_CREDIT`, `MANUAL_DEBIT`) is executed inside atomic PostgreSQL database transactions with row-level locks (`SELECT ... FOR UPDATE`).
   - Balances use PostgreSQL `NUMERIC(14, 4)` with strict `CHECK (balance >= 0)`.
   - Never relies on floating-point arithmetic or client-side trust.
2. **Dual-Driver PostgreSQL Database**:
   - **Production**: Connects directly to external cloud PostgreSQL pools (Neon, Supabase, Vercel Postgres, Railway) with SSL via `pg.Pool`.
   - **Zero-Setup Local Dev & Tests**: Embedded WASM PostgreSQL engine (`@electric-sql/pglite`) persisting to disk in `./data/asalia_pg`, executing identical SQL dialect, types, constraints, and ACID transactions.
3. **Manual SMM Fulfillment & WhatsApp Auxiliaries**:
   - No fake APIs or simulated third-party deliveries.
   - Orders and deposits are recorded directly in PostgreSQL and managed from the Admin Panel.
   - Generates pre-filled WhatsApp links targeted to **`+201030646757`** as an auxiliary communication channel.
4. **Vercel Serverless Ready**:
   - Ephemeral serverless runtime compatible.
   - Payment screenshots use a pluggable persistent storage abstraction (`src/storage/index.js`) supporting Cloudflare R2 / AWS S3, Cloudinary, and local storage fallback.
5. **Bilingual & Responsive Design**:
   - Full English (LTR) and Arabic (RTL) localization.
   - Polished dark mode (default) and light mode toggle.

---

## 📁 Project Structure

```
asalia/
├── api/
│   └── index.js                 # Vercel serverless entrypoint
├── public/                      # Lightweight, high-performance frontend
│   ├── css/
│   │   └── style.css            # Custom design tokens, glassmorphism, RTL/LTR
│   ├── js/
│   │   ├── i18n.js              # English / Arabic localization manager
│   │   ├── api.js               # Standardized fetch client & toast helpers
│   │   ├── app.js               # Customer dashboard controller
│   │   └── admin.js             # Admin panel controller
│   ├── index.html               # Landing page, guest service browser & auth modals
│   ├── app.html                 # Customer dashboard & order portal
│   └── admin.html               # Master admin fulfillment & control panel
├── src/
│   ├── app.js                   # Express application configuration & security
│   ├── server.js                # Local server entrypoint
│   ├── database/
│   │   ├── db.js                # PostgreSQL connection abstraction (pg + pglite)
│   │   ├── migrate.js           # Automated migration runner
│   │   └── migrations/          # Versioned SQL migrations (001_initial_schema.sql)
│   ├── middleware/
│   │   ├── auth.js              # JWT & HTTP-only cookie authentication & role guards
│   │   ├── rateLimit.js         # Brute-force & spam protection
│   │   └── upload.js            # Multer MIME and 5MB validation
│   ├── routes/
│   │   ├── auth.js              # Registration, login, logout, me
│   │   ├── dashboard.js         # Real PostgreSQL customer statistics
│   │   ├── services.js          # Services and categories
│   │   ├── orders.js            # Atomic order placement & 10s cooldown
│   │   ├── deposits.js          # Add funds & proof submission
│   │   ├── wallet.js            # Authoritative ledger history
│   │   ├── tickets.js           # Support ticketing
│   │   ├── settings.js          # Public settings
│   │   └── admin.js             # Master admin management & fulfillment
│   ├── services/
│   │   ├── orderService.js      # ACID order creation & refund logic
│   │   └── depositService.js    # ACID deposit review & wallet crediting
│   ├── storage/
│   │   └── index.js             # Persistent file storage provider abstraction
│   └── utils/
│       └── validation.js        # Social media link validators
├── scripts/
│   ├── create-admin.js          # Secure admin setup CLI (npm run create-admin)
│   └── seed-dev.js              # Optional dev seed data (npm run seed-dev)
├── tests/
│   ├── phase1.test.js           # Auth & foundation test suite
│   ├── phase2.test.js           # Ordering & ledger test suite
│   └── platform.test.js         # Comprehensive 11-step E2E test suite
├── vercel.json                  # Vercel serverless routing & security headers
├── .env.example                 # Environment configuration template
└── package.json
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js v18+ (tested on Node v20/v24)
- npm

### 2. Installation
```bash
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 4. Database Migrations
Migrations run automatically on server boot, or manually via:
```bash
npm run migrate
```

### 5. Create Master Admin
To create or update the single Master Admin account:
```bash
npm run create-admin
# Or non-interactively:
node scripts/create-admin.js --email admin@asalia.com --username asalia_admin --password YourStrongPassword123!
```

### 6. (Optional) Seed Initial Dev Data
To populate sample services and payment methods for testing:
```bash
npm run seed-dev
```

### 7. Run Locally
```bash
npm run dev
```
Open **http://localhost:3000** in your browser:
- Customer Portal: `http://localhost:3000/dashboard`
- Admin Panel: `http://localhost:3000/admin`

---

## 🧪 Automated Testing

Run the automated test suite executing across an isolated database:
```bash
npm test
```
The test suite validates:
- Role-based authorization & security headers
- Atomic order placement with server-side price recalculation
- Insufficient balance rejection
- 10-second duplicate order protection & idempotency
- Deposit submission & persistent screenshot storage
- Admin deposit approval and atomic wallet credit
- Duplicate approval prevention
- Service price snapshotting (verifying price changes do not mutate old orders)
- Order status updates & atomic refunds

---

## ☁️ Vercel Deployment

1. Push code to your Git repository (GitHub / GitLab).
2. Import project into Vercel.
3. Configure Environment Variables in Vercel Project Settings:
   - `DATABASE_URL`: Your production PostgreSQL connection string (Neon, Supabase, Railway, etc.).
   - `JWT_SECRET`: Random 64-character secret.
   - `STORAGE_PROVIDER`: `s3` or `cloudinary`.
   - `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` (if using S3/R2).
   - `SUPPORT_WHATSAPP`: `+201030646757`
4. Deploy! Vercel will automatically route static files from `public/` and API endpoints through `api/index.js`.

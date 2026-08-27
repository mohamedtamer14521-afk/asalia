-- ASALIA Initial Schema Migration
-- Migration: 001_initial_schema.sql

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'ADMIN')),
    balance NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (balance >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Service Categories Table
CREATE TABLE IF NOT EXISTS service_categories (
    id SERIAL PRIMARY KEY,
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    icon VARCHAR(50) DEFAULT 'globe',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_platform ON service_categories(platform);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON service_categories(sort_order);

-- 3. Services Table
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES service_categories(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    description_en TEXT,
    description_ar TEXT,
    price_per_1000 NUMERIC(12, 4) NOT NULL CHECK (price_per_1000 >= 0),
    min_quantity INT NOT NULL CHECK (min_quantity > 0),
    max_quantity INT NOT NULL CHECK (max_quantity >= min_quantity),
    link_type VARCHAR(50) NOT NULL DEFAULT 'custom',
    is_active BOOLEAN DEFAULT true,
    refill_available BOOLEAN DEFAULT false,
    cancel_available BOOLEAN DEFAULT false,
    is_recommended BOOLEAN DEFAULT false,
    is_fast BOOLEAN DEFAULT false,
    processing_time_info VARCHAR(100) DEFAULT '0-24 Hours',
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_platform ON services(platform);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);

-- 4. Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    account_holder VARCHAR(100),
    instructions_en TEXT,
    instructions_ar TEXT,
    min_deposit NUMERIC(12, 2) NOT NULL DEFAULT 10.00 CHECK (min_deposit >= 0),
    max_deposit NUMERIC(12, 2) NOT NULL DEFAULT 50000.00 CHECK (max_deposit >= min_deposit),
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

-- 5. Deposits Table
CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_method_id INT REFERENCES payment_methods(id) ON DELETE SET NULL,
    payment_method_name_snap VARCHAR(100) NOT NULL,
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    sender_number VARCHAR(100) NOT NULL,
    transaction_reference VARCHAR(100),
    screenshot_storage_key VARCHAR(500) NOT NULL,
    screenshot_file_type VARCHAR(50),
    screenshot_size INT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_created ON deposits(created_at DESC);

-- 6. Wallet Transactions Table (Strict Ledger)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('DEPOSIT', 'ORDER_CHARGE', 'REFUND', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'ADJUSTMENT')),
    amount NUMERIC(14, 4) NOT NULL,
    balance_before NUMERIC(14, 4) NOT NULL,
    balance_after NUMERIC(14, 4) NOT NULL,
    description TEXT NOT NULL,
    reference_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON wallet_transactions(created_at DESC);

-- 7. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_username_snap VARCHAR(50) NOT NULL,
    customer_email_snap VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    category_name_snap VARCHAR(100) NOT NULL,
    service_id INT REFERENCES services(id) ON DELETE SET NULL,
    service_name_snap VARCHAR(255) NOT NULL,
    service_price_snap NUMERIC(12, 4) NOT NULL,
    username VARCHAR(100),
    target_link TEXT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    charge NUMERIC(14, 4) NOT NULL CHECK (charge >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    balance_before NUMERIC(14, 4) NOT NULL,
    balance_after NUMERIC(14, 4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'CANCELED', 'REFUNDED')),
    remains INT DEFAULT 0,
    start_count INT DEFAULT 0,
    admin_notes TEXT,
    idempotency_key VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key);

-- 8. Order Events Table
CREATE TABLE IF NOT EXISTS order_events (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    notes TEXT,
    changed_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

-- 9. Tickets Table
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'General',
    order_id INT REFERENCES orders(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_ADMIN', 'CLOSED')),
    priority VARCHAR(20) DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

-- 10. Ticket Messages Table
CREATE TABLE IF NOT EXISTS ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_admin_reply BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

-- 11. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title_en VARCHAR(255) NOT NULL,
    title_ar VARCHAR(255) NOT NULL,
    message_en TEXT NOT NULL,
    message_ar TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    link VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- 12. Admin Logs Table
CREATE TABLE IF NOT EXISTS admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(50),
    before_state TEXT,
    after_state TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);

-- 13. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Refill Requests Table
CREATE TABLE IF NOT EXISTS refill_requests (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refill_order ON refill_requests(order_id);

-- 15. Cancel Requests Table
CREATE TABLE IF NOT EXISTS cancel_requests (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cancel_order ON cancel_requests(order_id);

-- Initial Essential Platform Settings
INSERT INTO settings (key, value, description) VALUES
    ('site_name', 'ASALIA', 'Platform Brand Name'),
    ('support_whatsapp', '+201030646757', 'Customer Support WhatsApp Number'),
    ('announcement_en', 'Welcome to ASALIA — The premier manual SMM fulfillment platform.', 'English site announcement'),
    ('announcement_ar', 'مرحباً بكم في أصالة — منصة خدمات التسويق الإلكتروني والتنفيذ اليدوي الرائدة.', 'Arabic site announcement'),
    ('exchange_rate_usd', '0.020', 'EGP to USD conversion rate for display'),
    ('exchange_rate_eur', '0.019', 'EGP to EUR conversion rate for display'),
    ('exchange_rate_gbp', '0.016', 'EGP to GBP conversion rate for display'),
    ('registration_enabled', 'true', 'Whether new user registrations are open'),
    ('maintenance_mode', 'false', 'Global maintenance mode flag')
ON CONFLICT (key) DO NOTHING;

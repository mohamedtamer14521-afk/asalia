-- Migration: 004_enhance_roles_and_permissions.sql
-- Expand user roles to include ADMIN, MANAGER, SUPPORT, CUSTOMER

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'ADMIN', 'MANAGER', 'SUPPORT'));

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Migration: Add image_url to payment_methods and services if not exists
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;

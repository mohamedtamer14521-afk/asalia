-- Migration: Alter deposits screenshot_storage_key to TEXT for permanent Data URL storage
ALTER TABLE deposits ALTER COLUMN screenshot_storage_key TYPE TEXT;

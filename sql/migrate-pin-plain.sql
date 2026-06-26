-- Switch users.pin_hash + salt → plain pin column

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin TEXT;

ALTER TABLE users DROP COLUMN IF EXISTS pin_hash;
ALTER TABLE users DROP COLUMN IF EXISTS salt;

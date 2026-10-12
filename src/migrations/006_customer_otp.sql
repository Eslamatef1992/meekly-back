-- 006_customer_otp.sql
-- Customer OTP storage for phone-based storefront login
-- Idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS customer_otps (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone       VARCHAR(40)     NOT NULL,
  code        VARCHAR(10)     NOT NULL,
  expires_at  DATETIME        NOT NULL,
  used        TINYINT         NOT NULL DEFAULT 0,
  created_at  DATETIME        NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_otps_phone (phone),  -- one active OTP per phone
  KEY ix_customer_otps_expires (expires_at, used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Customer OTP migration applied' AS result;

-- Add bank_extra_data column to hriq_employees for country-specific banking fields
-- e.g. Chile: { rut, accountType, bankCode, phoneNumber }
--      Colombia: { idType, idNumber, accountType, bankCode, phoneNumber }
--      Philippines: { bankCode }
ALTER TABLE hriq_employees
  ADD COLUMN IF NOT EXISTS bank_extra_data jsonb;

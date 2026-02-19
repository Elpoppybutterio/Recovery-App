ALTER TABLE sponsor_config
  ADD COLUMN IF NOT EXISTS repeat_unit TEXT,
  ADD COLUMN IF NOT EXISTS repeat_interval INTEGER,
  ADD COLUMN IF NOT EXISTS repeat_days TEXT[];

UPDATE sponsor_config
SET
  repeat_unit = CASE
    WHEN repeat_rule = 'MONTHLY' THEN 'MONTHLY'
    ELSE 'WEEKLY'
  END,
  repeat_interval = CASE
    WHEN repeat_rule = 'BIWEEKLY' THEN 2
    ELSE 1
  END,
  repeat_days = CASE
    WHEN repeat_rule = 'WEEKDAYS' THEN ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI']::TEXT[]
    WHEN repeat_rule = 'DAILY' THEN ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']::TEXT[]
    WHEN repeat_rule = 'MONTHLY' THEN ARRAY[]::TEXT[]
    ELSE ARRAY['MON']::TEXT[]
  END
WHERE repeat_unit IS NULL OR repeat_interval IS NULL OR repeat_days IS NULL;

ALTER TABLE sponsor_config
  ALTER COLUMN repeat_unit SET NOT NULL,
  ALTER COLUMN repeat_interval SET NOT NULL,
  ALTER COLUMN repeat_days SET NOT NULL,
  ALTER COLUMN repeat_unit SET DEFAULT 'WEEKLY',
  ALTER COLUMN repeat_interval SET DEFAULT 1,
  ALTER COLUMN repeat_days SET DEFAULT ARRAY[]::TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sponsor_config_repeat_unit_check'
  ) THEN
    ALTER TABLE sponsor_config
      ADD CONSTRAINT sponsor_config_repeat_unit_check
      CHECK (repeat_unit IN ('WEEKLY', 'MONTHLY'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sponsor_config_repeat_interval_check'
  ) THEN
    ALTER TABLE sponsor_config
      ADD CONSTRAINT sponsor_config_repeat_interval_check
      CHECK (repeat_interval > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sponsor_config_repeat_days_values_check'
  ) THEN
    ALTER TABLE sponsor_config
      ADD CONSTRAINT sponsor_config_repeat_days_values_check
      CHECK (repeat_days <@ ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']::TEXT[]);
  END IF;
END
$$;

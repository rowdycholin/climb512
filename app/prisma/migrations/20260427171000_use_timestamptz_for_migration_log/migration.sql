ALTER TABLE "_app_migrations"
  ALTER COLUMN "applied_at" TYPE TIMESTAMPTZ(3) USING "applied_at" AT TIME ZONE 'UTC';

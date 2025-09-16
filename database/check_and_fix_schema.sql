-- Check the actual data type of the timestamp column
SELECT
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM
    information_schema.columns
WHERE
    table_name = 'attendance'
    AND column_name = 'timestamp';

-- If the timestamp column is not BIGINT, we need to migrate it
-- First, backup the existing data (if any)
DO $$
BEGIN
    -- Check if timestamp column is not BIGINT
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'attendance'
        AND column_name = 'timestamp'
        AND data_type != 'bigint'
    ) THEN
        RAISE NOTICE 'Timestamp column is not BIGINT, need to migrate...';

        -- Add a temporary column for the migration
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'attendance'
            AND column_name = 'timestamp_bigint'
        ) THEN
            ALTER TABLE attendance ADD COLUMN timestamp_bigint BIGINT;

            -- Copy existing timestamp data to the new column
            -- Convert TIMESTAMP to milliseconds since epoch
            UPDATE attendance
            SET timestamp_bigint = EXTRACT(EPOCH FROM timestamp::timestamp) * 1000
            WHERE timestamp IS NOT NULL;

            -- Drop the old column
            ALTER TABLE attendance DROP COLUMN timestamp;

            -- Rename the new column
            ALTER TABLE attendance RENAME COLUMN timestamp_bigint TO timestamp;

            -- Make it NOT NULL
            ALTER TABLE attendance ALTER COLUMN timestamp SET NOT NULL;

            -- Recreate the index
            DROP INDEX IF EXISTS idx_attendance_timestamp;
            CREATE INDEX idx_attendance_timestamp ON attendance(timestamp);

            RAISE NOTICE 'Migration completed successfully!';
        END IF;
    ELSE
        RAISE NOTICE 'Timestamp column is already BIGINT, no migration needed.';
    END IF;
END $$;

-- Verify the final state
SELECT
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM
    information_schema.columns
WHERE
    table_name = 'attendance'
    AND column_name = 'timestamp';
-- Update location column to support JSON strings and add validation
-- This script ensures the location field can handle JSON data properly

-- First, check if we need to update the location column
DO $$
BEGIN
    -- Check if location column exists and is the right type
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'attendance'
        AND column_name = 'location'
        AND character_maximum_length < 1000
    ) THEN
        -- Update the location column to handle larger JSON strings
        ALTER TABLE attendance ALTER COLUMN location TYPE TEXT;
        RAISE NOTICE 'Updated location column to TEXT type for better JSON support';
    ELSIF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'attendance'
        AND column_name = 'location'
    ) THEN
        -- Add location column if it doesn't exist
        ALTER TABLE attendance ADD COLUMN location TEXT;
        RAISE NOTICE 'Added location column as TEXT type';
    ELSE
        RAISE NOTICE 'Location column already exists with adequate size';
    END IF;

    -- Add a check constraint to validate JSON if location is provided
    -- First drop the constraint if it exists
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'attendance'
        AND constraint_name = 'location_valid_json'
    ) THEN
        ALTER TABLE attendance DROP CONSTRAINT location_valid_json;
    END IF;

    -- Add the JSON validation constraint
    ALTER TABLE attendance ADD CONSTRAINT location_valid_json
        CHECK (location IS NULL OR location = '' OR (location::json IS NOT NULL));

    RAISE NOTICE 'Added JSON validation constraint for location field';

EXCEPTION
    WHEN invalid_text_representation THEN
        -- If existing data is not valid JSON, we'll allow it but log a warning
        RAISE WARNING 'Some existing location data may not be valid JSON. Consider cleaning the data.';

        -- Add constraint without JSON validation
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_name = 'attendance'
            AND constraint_name = 'location_not_empty'
        ) THEN
            ALTER TABLE attendance ADD CONSTRAINT location_not_empty
                CHECK (location IS NULL OR length(trim(location)) > 0);
        END IF;
END $$;

-- Create an index on location for better query performance (for non-null values)
CREATE INDEX IF NOT EXISTS idx_attendance_location ON attendance(location) WHERE location IS NOT NULL;

-- Verify the current state
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM
    information_schema.columns
WHERE
    table_name = 'attendance'
    AND column_name = 'location';

-- Show any existing constraints on the location column
SELECT
    constraint_name,
    constraint_type
FROM
    information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE
    tc.table_name = 'attendance'
    AND ccu.column_name = 'location';

RAISE NOTICE 'Location column is now ready to handle JSON strings!';
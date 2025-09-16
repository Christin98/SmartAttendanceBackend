const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAndMigrateTimestamp() {
  const client = await pool.connect();

  try {
    console.log('Checking timestamp column type...');

    // Check current column type
    const checkQuery = `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'attendance' AND column_name = 'timestamp'
    `;

    const checkResult = await client.query(checkQuery);

    if (checkResult.rows.length === 0) {
      console.log('Attendance table or timestamp column not found!');
      return;
    }

    const columnInfo = checkResult.rows[0];
    console.log('Current timestamp column type:', columnInfo);

    if (columnInfo.data_type === 'bigint') {
      console.log('✓ Timestamp column is already BIGINT. No migration needed.');
      return;
    }

    console.log('⚠ Timestamp column is not BIGINT. Starting migration...');

    // Begin transaction
    await client.query('BEGIN');

    try {
      // Check if we have any existing data
      const countResult = await client.query('SELECT COUNT(*) FROM attendance');
      const recordCount = parseInt(countResult.rows[0].count);
      console.log(`Found ${recordCount} existing attendance records`);

      if (recordCount > 0) {
        // Backup existing data
        console.log('Backing up existing data...');

        // Add temporary column
        await client.query('ALTER TABLE attendance ADD COLUMN timestamp_bigint BIGINT');

        // Convert existing timestamps to milliseconds
        await client.query(`
          UPDATE attendance
          SET timestamp_bigint = EXTRACT(EPOCH FROM timestamp::timestamp) * 1000
          WHERE timestamp IS NOT NULL
        `);

        // Drop old column
        await client.query('ALTER TABLE attendance DROP COLUMN timestamp');

        // Rename new column
        await client.query('ALTER TABLE attendance RENAME COLUMN timestamp_bigint TO timestamp');
      } else {
        // No data, just change column type
        console.log('No existing data, directly changing column type...');

        // Drop the old column
        await client.query('ALTER TABLE attendance DROP COLUMN timestamp');

        // Add new column with correct type
        await client.query('ALTER TABLE attendance ADD COLUMN timestamp BIGINT NOT NULL');
      }

      // Recreate index
      console.log('Recreating index...');
      await client.query('DROP INDEX IF EXISTS idx_attendance_timestamp');
      await client.query('CREATE INDEX idx_attendance_timestamp ON attendance(timestamp)');

      // Commit transaction
      await client.query('COMMIT');

      console.log('✓ Migration completed successfully!');

      // Verify the change
      const verifyResult = await client.query(checkQuery);
      console.log('New timestamp column type:', verifyResult.rows[0]);

    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
checkAndMigrateTimestamp()
  .then(() => {
    console.log('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
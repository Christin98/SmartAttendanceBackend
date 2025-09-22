const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
    require: true
  }
});

async function applyTrialSchema() {
  try {
    console.log('Connecting to database...');

    // Read the trial schema SQL file
    const schemaPath = path.join(__dirname, 'trial_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Applying trial schema...');

    // Execute the SQL
    await pool.query(schemaSql);

    console.log('✅ Trial schema applied successfully!');

    // Verify the tables were created
    const checkTables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('trial_devices', 'trial_keys')
    `);

    console.log('Created tables:', checkTables.rows.map(r => r.table_name).join(', '));

    // Check if default trial key was inserted
    const checkKey = await pool.query(
      "SELECT * FROM trial_keys WHERE trial_key = 'SAT-TRIAL-2025-CLIENT-TEST'"
    );

    if (checkKey.rows.length > 0) {
      console.log('✅ Default trial key created:', checkKey.rows[0].trial_key);
    }

  } catch (error) {
    console.error('❌ Error applying trial schema:', error.message);
    console.error(error.detail || '');
  } finally {
    await pool.end();
  }
}

// Run the script
applyTrialSchema();
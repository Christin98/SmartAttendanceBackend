-- Trial License Management Schema
-- This creates the tables needed for managing trial versions of the app

-- Trial devices table
CREATE TABLE IF NOT EXISTS trial_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(255) NOT NULL,
    device_model VARCHAR(100),
    android_version INTEGER,
    app_version VARCHAR(50),
    trial_key VARCHAR(100) NOT NULL,
    registration_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create unique constraint to prevent duplicate device registrations
ALTER TABLE trial_devices
ADD CONSTRAINT unique_device_trial
UNIQUE (device_id, trial_key);

-- Indexes for better performance
CREATE INDEX idx_trial_devices_device_id ON trial_devices(device_id);
CREATE INDEX idx_trial_devices_trial_key ON trial_devices(trial_key);
CREATE INDEX idx_trial_devices_registration_date ON trial_devices(registration_date);

-- Trial keys table (optional - for managing multiple trial campaigns)
CREATE TABLE IF NOT EXISTS trial_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_key VARCHAR(100) UNIQUE NOT NULL,
    client_name VARCHAR(200),
    max_devices INTEGER DEFAULT 2,
    trial_days INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Insert default trial key
INSERT INTO trial_keys (trial_key, client_name, max_devices, trial_days)
VALUES ('SAT-TRIAL-2025-CLIENT-TEST', 'Test Client', 2, 30)
ON CONFLICT (trial_key) DO NOTHING;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_trial_devices_updated_at
BEFORE UPDATE ON trial_devices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- View to see trial status summary
CREATE OR REPLACE VIEW trial_status_summary AS
SELECT
    tk.trial_key,
    tk.client_name,
    tk.max_devices,
    tk.trial_days,
    COUNT(td.id) as devices_registered,
    tk.max_devices - COUNT(td.id) as devices_remaining,
    MIN(td.registration_date) as first_registration,
    MAX(td.registration_date) as last_registration
FROM trial_keys tk
LEFT JOIN trial_devices td ON tk.trial_key = td.trial_key
WHERE tk.is_active = true
GROUP BY tk.trial_key, tk.client_name, tk.max_devices, tk.trial_days;

-- Function to check if a device's trial has expired
CREATE OR REPLACE FUNCTION is_trial_expired(device_registration_date TIMESTAMP, trial_days INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (CURRENT_TIMESTAMP > device_registration_date + (trial_days || ' days')::INTERVAL);
END;
$$ LANGUAGE plpgsql;

-- Example query to get all active trials with expiration status
-- SELECT
--     td.*,
--     tk.trial_days,
--     is_trial_expired(td.registration_date, tk.trial_days) as is_expired,
--     (td.registration_date + (tk.trial_days || ' days')::INTERVAL) as expiry_date
-- FROM trial_devices td
-- JOIN trial_keys tk ON td.trial_key = tk.trial_key;
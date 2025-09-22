# Trial License API Documentation

## Overview
The Trial License API manages trial versions of the Smart Attendance System app, limiting installations to 2 devices per trial key and enforcing a 30-day trial period.

## Setup

### 1. Apply Database Schema
```bash
node database/apply_trial_schema.js
```

This creates:
- `trial_devices` table - Stores registered devices
- `trial_keys` table - Manages trial keys and limits
- Default trial key: `SAT-TRIAL-2025-CLIENT-TEST`

### 2. Test the API
```bash
node test_trial_api.js
```

## API Endpoints

### 1. Validate Device
**POST** `/api/trial/validate`

Checks if a device can use the trial version.

**Request:**
```json
{
  "deviceId": "hashed-device-id",
  "deviceModel": "SM-S721B",
  "androidVersion": 34,
  "appVersion": "1.9.27",
  "trialKey": "SAT-TRIAL-2025-CLIENT-TEST",
  "timestamp": 1234567890
}
```

**Response:**
```json
{
  "status": "valid" | "device_limit_exceeded" | "expired" | "invalid"
}
```

Status meanings:
- `valid` - Device can use the trial
- `device_limit_exceeded` - Already 2 devices registered
- `expired` - 30-day trial period expired
- `invalid` - Invalid trial key

### 2. Register Device
**POST** `/api/trial/register`

Registers a new device for trial usage.

**Request:**
```json
{
  "deviceId": "hashed-device-id",
  "deviceModel": "SM-S721B",
  "androidVersion": 34,
  "appVersion": "1.9.27",
  "trialKey": "SAT-TRIAL-2025-CLIENT-TEST",
  "registrationDate": 1234567890
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device registered successfully"
}
```

### 3. Get Trial Status (Admin)
**GET** `/api/trial/status/:trialKey`

Gets status and registered devices for a trial key.

**Response:**
```json
{
  "trial_key": "SAT-TRIAL-2025-CLIENT-TEST",
  "device_count": 2,
  "max_devices": 2,
  "devices": [
    {
      "device_id": "hash1",
      "device_model": "Phone 1",
      "registration_date": "2025-01-01T00:00:00Z",
      "days_used": 5,
      "remaining_days": 25,
      "is_expired": false
    }
  ]
}
```

### 4. Delete Device (Admin)
**DELETE** `/api/trial/device/:deviceId`

Removes a device from trial registration.

**Response:**
```json
{
  "success": true,
  "message": "Device removed successfully"
}
```

## How It Works

1. **First Launch:** App calls `/validate` endpoint
   - If device not registered and < 2 devices exist → Returns "valid"
   - App then calls `/register` to register the device

2. **Subsequent Launches:** App calls `/validate`
   - If device is registered and < 30 days → Returns "valid"
   - If device is registered and > 30 days → Returns "expired"
   - If device not registered and >= 2 devices → Returns "device_limit_exceeded"

3. **Offline Mode:** If API is unreachable, app falls back to local validation

## Managing Trial Keys

Add new trial keys to the `trial_keys` table:

```sql
INSERT INTO trial_keys (trial_key, client_name, max_devices, trial_days)
VALUES ('YOUR-NEW-TRIAL-KEY', 'Client Name', 2, 30);
```

View all trial keys:
```sql
SELECT * FROM trial_keys;
```

View trial summary:
```sql
SELECT * FROM trial_status_summary;
```

## Security Notes

1. **Device IDs are hashed** - The app sends SHA-256 hashed device IDs, not raw Android IDs
2. **No API key required** - Trial endpoints are public (by design) for easy client testing
3. **Trial keys** - Use different trial keys for different clients to isolate their device limits
4. **Expiration** - 30-day expiration is enforced both client-side and server-side

## Database Queries

### Check all devices for a trial key
```sql
SELECT * FROM trial_devices
WHERE trial_key = 'SAT-TRIAL-2025-CLIENT-TEST'
ORDER BY registration_date DESC;
```

### Check expired trials
```sql
SELECT
  td.*,
  (td.registration_date + INTERVAL '30 days') as expiry_date,
  CASE
    WHEN CURRENT_TIMESTAMP > (td.registration_date + INTERVAL '30 days')
    THEN true
    ELSE false
  END as is_expired
FROM trial_devices td
WHERE trial_key = 'SAT-TRIAL-2025-CLIENT-TEST';
```

### Clean up old expired trials
```sql
DELETE FROM trial_devices
WHERE registration_date < (CURRENT_TIMESTAMP - INTERVAL '60 days');
```

## Deployment to Vercel

The trial routes are already included in `server.js` and will be deployed automatically when you push to Vercel.

## Testing with the App

1. Install the app on Device 1 → Should work ✅
2. Install the app on Device 2 → Should work ✅
3. Try to install on Device 3 → Should show "Device limit exceeded" ❌
4. Wait 30 days (or modify registration_date in DB) → Should show "Trial expired" ❌

## Troubleshooting

### "Invalid trial key" error
- Check that the trial key matches exactly: `SAT-TRIAL-2025-CLIENT-TEST`
- Verify the trial key exists in `trial_keys` table

### "Device limit exceeded" for first device
- Check if test devices are already in the database
- Run: `SELECT COUNT(*) FROM trial_devices WHERE trial_key = 'SAT-TRIAL-2025-CLIENT-TEST';`

### Database connection errors
- Verify `.env` file has correct database credentials
- Check that trial tables exist: `\dt trial*` in psql
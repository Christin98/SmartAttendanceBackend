const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  // Validate trial device
  router.post('/validate', async (req, res) => {
    try {
      const {
        deviceId,
        deviceModel,
        androidVersion,
        appVersion,
        trialKey,
        timestamp
      } = req.body;

      // Validate required fields
      if (!deviceId || !trialKey) {
        return res.status(400).json({
          error: 'Missing required fields: deviceId and trialKey'
        });
      }

      // Check if trial key is valid
      const validTrialKeys = [
        'SAT-TRIAL-2025-CLIENT-TEST', // Default trial key
        // Add more trial keys for different clients here
      ];

      if (!validTrialKeys.includes(trialKey)) {
        return res.json({ status: 'invalid' });
      }

      // Check if device is already registered
      const deviceCheck = await pool.query(
        'SELECT * FROM trial_devices WHERE device_id = $1 AND trial_key = $2',
        [deviceId, trialKey]
      );

      if (deviceCheck.rows.length > 0) {
        // Device already registered, check if trial expired
        const device = deviceCheck.rows[0];
        const registrationDate = new Date(device.registration_date);
        const now = new Date();
        const daysSinceRegistration = Math.floor(
          (now - registrationDate) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceRegistration > 30) {
          return res.json({ status: 'expired' });
        }

        return res.json({ status: 'valid' });
      }

      // Check device count for this trial key
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM trial_devices WHERE trial_key = $1',
        [trialKey]
      );

      const deviceCount = parseInt(countResult.rows[0].count);

      // Check if limit exceeded (2 devices per trial key)
      if (deviceCount >= 2) {
        return res.json({ status: 'device_limit_exceeded' });
      }

      // New device, can be registered
      return res.json({ status: 'valid' });

    } catch (error) {
      console.error('Trial validation error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // Register new trial device
  router.post('/register', async (req, res) => {
    try {
      const {
        deviceId,
        deviceModel,
        androidVersion,
        appVersion,
        trialKey,
        registrationDate
      } = req.body;

      // Validate required fields
      if (!deviceId || !trialKey) {
        return res.status(400).json({
          error: 'Missing required fields: deviceId and trialKey'
        });
      }

      // Check if trial key is valid
      const validTrialKeys = [
        'SAT-TRIAL-2025-CLIENT-TEST',
        // Add more trial keys here
      ];

      if (!validTrialKeys.includes(trialKey)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid trial key'
        });
      }

      // Check if device already exists
      const existingDevice = await pool.query(
        'SELECT * FROM trial_devices WHERE device_id = $1 AND trial_key = $2',
        [deviceId, trialKey]
      );

      if (existingDevice.rows.length > 0) {
        return res.json({
          success: true,
          message: 'Device already registered'
        });
      }

      // Check device count
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM trial_devices WHERE trial_key = $1',
        [trialKey]
      );

      const deviceCount = parseInt(countResult.rows[0].count);

      if (deviceCount >= 2) {
        return res.status(400).json({
          success: false,
          message: 'Device limit exceeded for this trial key'
        });
      }

      // Register the new device
      const registrationTime = registrationDate ?
        new Date(registrationDate) : new Date();

      await pool.query(
        `INSERT INTO trial_devices
         (device_id, device_model, android_version, app_version, trial_key, registration_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deviceId, deviceModel, androidVersion, appVersion, trialKey, registrationTime]
      );

      res.json({
        success: true,
        message: 'Device registered successfully'
      });

    } catch (error) {
      console.error('Trial registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register device',
        error: error.message
      });
    }
  });

  // Get trial status (admin endpoint)
  router.get('/status/:trialKey', async (req, res) => {
    try {
      const { trialKey } = req.params;

      // Get all devices for this trial key
      const devices = await pool.query(
        'SELECT * FROM trial_devices WHERE trial_key = $1 ORDER BY registration_date',
        [trialKey]
      );

      // Calculate remaining days for each device
      const devicesWithStatus = devices.rows.map(device => {
        const registrationDate = new Date(device.registration_date);
        const now = new Date();
        const daysSinceRegistration = Math.floor(
          (now - registrationDate) / (1000 * 60 * 60 * 24)
        );
        const remainingDays = Math.max(0, 30 - daysSinceRegistration);
        const isExpired = daysSinceRegistration > 30;

        return {
          ...device,
          days_used: daysSinceRegistration,
          remaining_days: remainingDays,
          is_expired: isExpired
        };
      });

      res.json({
        trial_key: trialKey,
        device_count: devices.rows.length,
        max_devices: 2,
        devices: devicesWithStatus
      });

    } catch (error) {
      console.error('Trial status error:', error);
      res.status(500).json({
        error: 'Failed to get trial status',
        message: error.message
      });
    }
  });

  // Delete trial device (admin endpoint)
  router.delete('/device/:deviceId', async (req, res) => {
    try {
      const { deviceId } = req.params;

      const result = await pool.query(
        'DELETE FROM trial_devices WHERE device_id = $1 RETURNING *',
        [deviceId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Device not found'
        });
      }

      res.json({
        success: true,
        message: 'Device removed successfully',
        device: result.rows[0]
      });

    } catch (error) {
      console.error('Delete device error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete device',
        error: error.message
      });
    }
  });

  return router;
};
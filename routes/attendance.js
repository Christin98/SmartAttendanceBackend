const express = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = (pool) => {
  const router = express.Router();

  // Record attendance (check-in/out) with face verification
  router.post('/record', async (req, res) => {
    try {
      const { employeeId, checkType, timestamp, deviceId, location, mode = 'ONLINE', embedding } = req.body;

      // Debug logging
      console.log('Attendance record request:', {
        employeeId,
        checkType,
        timestamp,
        timestampType: typeof timestamp,
        deviceId,
        location,
        mode,
        hasEmbedding: !!embedding
      });

      if (!employeeId || !checkType || !deviceId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      if (!['IN', 'OUT'].includes(checkType)) {
        return res.status(400).json({ error: 'Invalid check type. Must be IN or OUT' });
      }

      // If embedding is provided, verify it matches the employee
      if (embedding && Array.isArray(embedding)) {
        const verifyQuery = `
          SELECT * FROM find_employee_by_embedding($1::float[], $2::float)
        `;
        
        const verifyResult = await pool.query(verifyQuery, [embedding, 0.95]);
        
        if (verifyResult.rows.length === 0) {
          return res.status(403).json({ 
            error: 'Face verification failed. No matching employee found.',
            verificationFailed: true 
          });
        }
        
        // Check if the verified employee matches the provided employeeId
        if (verifyResult.rows[0].employee_id !== employeeId) {
          return res.status(403).json({ 
            error: 'Face verification failed. Face does not match the employee ID.',
            verificationFailed: true,
            detectedEmployeeId: verifyResult.rows[0].employee_id,
            detectedEmployeeName: verifyResult.rows[0].name
          });
        }
        
        console.log(`Face verified for employee ${employeeId} with similarity: ${verifyResult.rows[0].similarity}`);
      }

      // Get employee code
      const empQuery = 'SELECT employee_code, name FROM employees WHERE employee_id = $1';
      const empResult = await pool.query(empQuery, [employeeId]);
      
      if (empResult.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      const employeeCode = empResult.rows[0].employee_code;
      const employeeName = empResult.rows[0].name;

      // Check for duplicate check-in/out within 5 minutes
      const currentTimestamp = timestamp ? parseInt(timestamp) : Date.now();
      const fiveMinutesAgo = currentTimestamp - (5 * 60 * 1000);

      // Use BIGINT comparison for timestamp column
      const duplicateQuery = `
        SELECT id FROM attendance
        WHERE employee_id = $1
          AND check_type = $2
          AND timestamp > $3
        ORDER BY timestamp DESC
        LIMIT 1
      `;

      const duplicateResult = await pool.query(duplicateQuery, [
        employeeId,
        checkType,
        fiveMinutesAgo
      ]);
      
      if (duplicateResult.rows.length > 0) {
        return res.status(409).json({ 
          error: 'Duplicate check-in/out detected. Please wait 5 minutes before trying again.' 
        });
      }

      // Insert attendance record
      const insertQuery = `
        INSERT INTO attendance (
          employee_id, employee_name, check_type, timestamp,
          device_id, location, synced_at, confidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 1.0)
        RETURNING *
      `;

      const result = await pool.query(insertQuery, [
        employeeId,
        employeeName,
        checkType,
        currentTimestamp, // Pass as BIGINT (milliseconds since epoch)
        deviceId,
        location || null
      ]);
      
      const attendance = result.rows[0];
      res.status(201).json({
        id: attendance.id,
        employeeId: attendance.employee_id,
        employeeName: attendance.employee_name,
        checkType: attendance.check_type,
        timestamp: parseInt(attendance.timestamp), // Already stored as BIGINT
        deviceId: attendance.device_id,
        location: attendance.location,
        syncedAt: attendance.synced_at,
        confidence: attendance.confidence,
        faceVerified: !!embedding,
        message: `Successfully recorded ${checkType} for ${attendance.employee_name}`
      });
    } catch (error) {
      console.error('Error recording attendance:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Sync multiple attendance records
  router.post('/sync', async (req, res) => {
    try {
      const records = req.body;
      
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty records array' });
      }

      const successfulRecords = [];
      const failedRecords = [];

      for (const record of records) {
        try {
          const { id, employeeId, checkType, timestamp, location, deviceId } = record;
          
          // Check if record already exists
          const checkQuery = 'SELECT id FROM attendance WHERE id = $1';
          const checkResult = await pool.query(checkQuery, [id]);
          
          if (checkResult.rows.length > 0) {
            // Update existing record
            const updateQuery = `
              UPDATE attendance 
              SET sync_status = 'SYNCED', 
                  location = COALESCE($2, location)
              WHERE id = $1
            `;
            await pool.query(updateQuery, [id, location]);
            successfulRecords.push(id);
          } else {
            // Get employee code
            const empQuery = 'SELECT employee_code FROM employees WHERE employee_id = $1';
            const empResult = await pool.query(empQuery, [employeeId]);
            
            if (empResult.rows.length === 0) {
              failedRecords.push({ id, error: 'Employee not found' });
              continue;
            }
            
            const employeeCode = empResult.rows[0].employee_code;
            
            // Insert new record
            const insertQuery = `
              INSERT INTO attendance (
                id, employee_id, employee_code, check_type, 
                timestamp, location, device_id, sync_status, mode
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, 'SYNCED', 'OFFLINE')
            `;
            
            await pool.query(insertQuery, [
              id,
              employeeId,
              employeeCode,
              checkType,
              new Date(parseInt(timestamp)), // Convert to Date for TIMESTAMP column
              location || null,
              deviceId
            ]);
            successfulRecords.push(id);
          }
        } catch (recordError) {
          console.error(`Error syncing record ${record.id}:`, recordError);
          failedRecords.push({ id: record.id, error: recordError.message });
        }
      }

      res.json({
        success: successfulRecords.length,
        failed: failedRecords.length,
        successfulRecords,
        failedRecords,
        message: `Synced ${successfulRecords.length} of ${records.length} records`
      });
    } catch (error) {
      console.error('Error syncing attendance:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get attendance history
  router.get('/history', async (req, res) => {
    try {
      const { employeeId, days = 30, startDate, endDate } = req.query;
      
      if (!employeeId) {
        return res.status(400).json({ error: 'Employee ID is required' });
      }

      let query = `
        SELECT * FROM attendance 
        WHERE employee_id = $1
      `;
      const params = [employeeId];

      if (startDate && endDate) {
        query += ' AND timestamp BETWEEN $2 AND $3';
        params.push(new Date(startDate), new Date(endDate));
      } else {
        const daysAgo = new Date(Date.now() - (parseInt(days) * 24 * 60 * 60 * 1000));
        query += ' AND timestamp > $2';
        params.push(daysAgo);
      }

      query += ' ORDER BY timestamp DESC';

      const result = await pool.query(query, params);
      
      const records = result.rows.map(record => ({
        id: record.id,
        employeeId: record.employee_id,
        checkType: record.check_type,
        timestamp: new Date(record.timestamp).getTime(), // Convert TIMESTAMP to milliseconds
        location: record.location,
        deviceId: record.device_id,
        syncStatus: record.sync_status,
        mode: record.mode
      }));

      res.json(records);
    } catch (error) {
      console.error('Error getting attendance history:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get daily attendance summary
  router.get('/daily-summary', async (req, res) => {
    try {
      const { date = new Date().toISOString().split('T')[0] } = req.query;
      
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const query = `
        SELECT
          e.employee_id,
          e.employee_code,
          e.name,
          e.department,
          (
            SELECT timestamp FROM attendance
            WHERE employee_id = e.employee_id
              AND check_type = 'IN'
              AND timestamp BETWEEN $1 AND $2
            ORDER BY timestamp ASC
            LIMIT 1
          ) as first_check_in,
          (
            SELECT timestamp FROM attendance
            WHERE employee_id = e.employee_id
              AND check_type = 'OUT'
              AND timestamp BETWEEN $1 AND $2
            ORDER BY timestamp DESC
            LIMIT 1
          ) as last_check_out
        FROM employees e
        WHERE e.is_active = true
        ORDER BY e.name
      `;

      const result = await pool.query(query, [startOfDay, endOfDay]);
      
      const summary = result.rows.map(row => ({
        employeeId: row.employee_id,
        employeeCode: row.employee_code,
        name: row.name,
        department: row.department,
        firstCheckIn: row.first_check_in ? new Date(row.first_check_in).getTime() : null,
        lastCheckOut: row.last_check_out ? new Date(row.last_check_out).getTime() : null,
        status: row.first_check_in ? 'Present' : 'Absent',
        workingHours: row.first_check_in && row.last_check_out
          ? ((new Date(row.last_check_out).getTime() - new Date(row.first_check_in).getTime()) / (1000 * 60 * 60)).toFixed(2)
          : null
      }));

      res.json({
        date,
        totalEmployees: summary.length,
        present: summary.filter(s => s.status === 'Present').length,
        absent: summary.filter(s => s.status === 'Absent').length,
        employees: summary
      });
    } catch (error) {
      console.error('Error getting daily summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get attendance statistics for an employee
  router.get('/stats/:employeeId', async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const query = `
        SELECT
          COUNT(DISTINCT DATE(timestamp)) as days_present,
          AVG(
            CASE
              WHEN check_type = 'OUT' THEN EXTRACT(EPOCH FROM timestamp)
              WHEN check_type = 'IN' THEN -EXTRACT(EPOCH FROM timestamp)
              ELSE 0
            END
          ) as avg_working_hours
        FROM attendance
        WHERE employee_id = $1
          AND timestamp BETWEEN $2 AND $3
      `;

      const result = await pool.query(query, [employeeId, startDate, endDate]);
      
      res.json({
        employeeId,
        month,
        year,
        daysPresent: parseInt(result.rows[0].days_present) || 0,
        totalWorkingDays: new Date(year, month, 0).getDate(),
        attendancePercentage: ((parseInt(result.rows[0].days_present) || 0) / new Date(year, month, 0).getDate() * 100).toFixed(2)
      });
    } catch (error) {
      console.error('Error getting attendance stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
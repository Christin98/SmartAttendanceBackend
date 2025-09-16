const express = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = (pool) => {
  const router = express.Router();

  // Find employee by embedding
  router.post('/find-by-embedding', async (req, res) => {
    try {
      const { embedding, threshold = 0.95 } = req.body;
      
      if (!embedding || !Array.isArray(embedding)) {
        return res.status(400).json({ error: 'Invalid embedding data' });
      }

      const query = `
        SELECT * FROM find_employee_by_embedding($1::float[], $2::float)
      `;
      
      const result = await pool.query(query, [embedding, threshold]);
      
      if (result.rows.length > 0) {
        const employee = result.rows[0];
        res.json({
          employeeId: employee.employee_id,
          employeeCode: employee.employee_code,
          name: employee.name,
          department: employee.department,
          faceId: employee.face_id,
          embedding: employee.embedding,
          registrationDate: employee.registration_date.getTime(),
          similarity: employee.similarity,
          isActive: true
        });
      } else {
        res.status(404).json({ message: 'No matching employee found' });
      }
    } catch (error) {
      console.error('Error finding employee by embedding:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Register new employee
  router.post('/register', async (req, res) => {
    try {
      const { employeeId, employeeCode, name, department, embedding, faceId } = req.body;

      // Debug logging
      console.log('Registration request received:', {
        employeeId,
        employeeCode,
        name,
        department,
        hasEmbedding: !!embedding,
        embeddingLength: embedding ? embedding.length : 0,
        faceId
      });

      if (!employeeCode || !name || !department) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if employee already exists (by employeeId if provided, otherwise by employeeCode)
      let checkQuery;
      let checkParams;

      if (employeeId) {
        // First check if this employeeId already exists
        checkQuery = 'SELECT employee_id, employee_code FROM employees WHERE employee_id = $1';
        checkParams = [employeeId];
      } else {
        // If no employeeId provided, check by employeeCode
        checkQuery = 'SELECT employee_id, employee_code FROM employees WHERE employee_code = $1';
        checkParams = [employeeCode];
      }

      const checkResult = await pool.query(checkQuery, checkParams);
      
      if (checkResult.rows.length > 0) {
        // If employee exists and employeeId matches, it's likely a re-registration/update
        if (employeeId && checkResult.rows[0].employee_id === employeeId) {
          // Update existing employee instead of creating new
          const updateQuery = `
            UPDATE employees
            SET name = $2,
                department = $3,
                embedding = $4,
                face_id = $5,
                updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = $1
            RETURNING *
          `;

          const result = await pool.query(updateQuery, [
            employeeId,
            name,
            department,
            embedding || null,
            faceId || null
          ]);

          const employee = result.rows[0];
          return res.status(200).json({
            employeeId: employee.employee_id,
            employeeCode: employee.employee_code,
            name: employee.name,
            department: employee.department,
            faceId: employee.face_id,
            embedding: employee.embedding,
            registrationDate: employee.registration_date.getTime(),
            isActive: employee.is_active
          });
        } else {
          return res.status(409).json({ error: 'Employee already exists' });
        }
      }

      // Insert new employee with provided employeeId if available
      let insertQuery;
      let insertParams;

      if (employeeId) {
        // Use the provided employeeId with explicit UUID casting
        insertQuery = `
          INSERT INTO employees (employee_id, employee_code, name, department, embedding, face_id)
          VALUES ($1::uuid, $2, $3, $4, $5, $6)
          RETURNING *
        `;
        insertParams = [
          employeeId.toLowerCase(), // Ensure lowercase UUID
          employeeCode,
          name,
          department,
          embedding || null,
          faceId || null
        ];
      } else {
        // Let PostgreSQL generate the employeeId
        insertQuery = `
          INSERT INTO employees (employee_code, name, department, embedding, face_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        insertParams = [
          employeeCode,
          name,
          department,
          embedding || null,
          faceId || null
        ];
      }

      const result = await pool.query(insertQuery, insertParams);
      
      const employee = result.rows[0];
      res.status(201).json({
        employeeId: employee.employee_id,
        employeeCode: employee.employee_code,
        name: employee.name,
        department: employee.department,
        faceId: employee.face_id,
        embedding: employee.embedding,
        registrationDate: employee.registration_date.getTime(),
        isActive: employee.is_active
      });
    } catch (error) {
      console.error('Error registering employee:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get employee by ID
  router.get('/:employeeId', async (req, res) => {
    try {
      const { employeeId } = req.params;
      
      const query = 'SELECT * FROM employees WHERE employee_id = $1 AND is_active = true';
      const result = await pool.query(query, [employeeId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      const employee = result.rows[0];
      res.json({
        employeeId: employee.employee_id,
        employeeCode: employee.employee_code,
        name: employee.name,
        department: employee.department,
        faceId: employee.face_id,
        registrationDate: employee.registration_date.getTime(),
        isActive: employee.is_active
      });
    } catch (error) {
      console.error('Error getting employee:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update employee
  router.put('/:employeeId', async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { name, department, faceId, embedding } = req.body;
      
      const updateQuery = `
        UPDATE employees 
        SET name = COALESCE($2, name),
            department = COALESCE($3, department),
            face_id = COALESCE($4, face_id),
            embedding = COALESCE($5, embedding),
            updated_at = CURRENT_TIMESTAMP
        WHERE employee_id = $1 AND is_active = true
        RETURNING *
      `;
      
      const result = await pool.query(updateQuery, [
        employeeId,
        name || null,
        department || null,
        faceId || null,
        embedding || null
      ]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      const employee = result.rows[0];
      res.json({
        employeeId: employee.employee_id,
        employeeCode: employee.employee_code,
        name: employee.name,
        department: employee.department,
        faceId: employee.face_id,
        registrationDate: employee.registration_date.getTime(),
        isActive: employee.is_active
      });
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // List all employees
  router.get('/', async (req, res) => {
    try {
      const { department, isActive = true } = req.query;
      
      let query = 'SELECT * FROM employees WHERE is_active = $1';
      const params = [isActive];
      
      if (department) {
        query += ' AND department = $2';
        params.push(department);
      }
      
      query += ' ORDER BY name';
      
      const result = await pool.query(query, params);
      
      const employees = result.rows.map(emp => ({
        employeeId: emp.employee_id,
        employeeCode: emp.employee_code,
        name: emp.name,
        department: emp.department,
        faceId: emp.face_id,
        registrationDate: emp.registration_date.getTime(),
        isActive: emp.is_active
      }));
      
      res.json(employees);
    } catch (error) {
      console.error('Error listing employees:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
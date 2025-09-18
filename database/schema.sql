-- Smart Attendance System Database Schema

-- Create database (run this separately if needed)
-- CREATE DATABASE smart_attendance;

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    employee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    face_id VARCHAR(255), -- Azure Face API person ID
    embedding FLOAT[], -- Face embedding array
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance records table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(employee_id),
    employee_code VARCHAR(50) NOT NULL,
    check_type VARCHAR(10) NOT NULL CHECK (check_type IN ('IN', 'OUT')),
    timestamp BIGINT NOT NULL, -- Unix timestamp in milliseconds
    location TEXT, -- Can store JSON strings for detailed location data
    device_id VARCHAR(255) NOT NULL,
    sync_status VARCHAR(20) DEFAULT 'SYNCED',
    confidence FLOAT,
    mode VARCHAR(20) DEFAULT 'ONLINE', -- ONLINE or OFFLINE
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX idx_attendance_employee_id ON attendance(employee_id);
CREATE INDEX idx_attendance_timestamp ON attendance(timestamp);
CREATE INDEX idx_attendance_sync_status ON attendance(sync_status);
CREATE INDEX idx_attendance_location ON attendance(location) WHERE location IS NOT NULL;
CREATE INDEX idx_employees_embedding ON employees USING GIN(embedding);

-- Constraints for data validation
ALTER TABLE attendance ADD CONSTRAINT location_valid_json
    CHECK (location IS NULL OR location = '' OR (location::json IS NOT NULL));

-- Function to calculate cosine similarity between embeddings
CREATE OR REPLACE FUNCTION cosine_similarity(a FLOAT[], b FLOAT[])
RETURNS FLOAT AS $$
DECLARE
    dot_product FLOAT := 0;
    norm_a FLOAT := 0;
    norm_b FLOAT := 0;
    i INT;
BEGIN
    IF array_length(a, 1) != array_length(b, 1) THEN
        RETURN 0;
    END IF;
    
    FOR i IN 1..array_length(a, 1) LOOP
        dot_product := dot_product + (a[i] * b[i]);
        norm_a := norm_a + (a[i] * a[i]);
        norm_b := norm_b + (b[i] * b[i]);
    END LOOP;
    
    IF norm_a = 0 OR norm_b = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to find employee by embedding
CREATE OR REPLACE FUNCTION find_employee_by_embedding(
    query_embedding FLOAT[],
    threshold FLOAT DEFAULT 0.95
)
RETURNS TABLE (
    employee_id UUID,
    employee_code VARCHAR,
    name VARCHAR,
    department VARCHAR,
    face_id VARCHAR,
    embedding FLOAT[],
    registration_date TIMESTAMP,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.employee_id,
        e.employee_code,
        e.name,
        e.department,
        e.face_id,
        e.embedding,
        e.registration_date,
        cosine_similarity(e.embedding, query_embedding) as similarity
    FROM employees e
    WHERE e.is_active = true
        AND e.embedding IS NOT NULL
        AND cosine_similarity(e.embedding, query_embedding) >= threshold
    ORDER BY similarity DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
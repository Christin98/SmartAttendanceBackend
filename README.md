# Smart Attendance System Backend

Backend API server for the Smart Attendance System Android app.

## Features

- Employee registration and management
- Face embedding-based employee identification
- Attendance recording (check-in/check-out)
- Offline data synchronization
- PostgreSQL database with cosine similarity search
- RESTful API with authentication

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. **Install dependencies:**
```bash
cd SmartAttendanceBackend
npm install
```

2. **Set up PostgreSQL database:**

First, create a database:
```sql
CREATE DATABASE smart_attendance;
```

Then run the schema:
```bash
psql -U your_username -d smart_attendance -f database/schema.sql
```

3. **Configure environment variables:**

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smart_attendance
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Server Configuration
PORT=3000
API_KEY=your-secret-api-key-here

# For Azure PostgreSQL (optional)
# DB_HOST=your-server.postgres.database.azure.com
# DB_USER=your_username@your-server
# DB_PASSWORD=your_password
# Add SSL settings in server.js if using Azure
```

4. **Start the server:**

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

Base URL: `http://localhost:3000/api`

All endpoints require authentication header:
```
Authorization: Bearer your-secret-api-key-here
```

### Employee Endpoints

#### Find Employee by Face Embedding
```
POST /api/employees/find-by-embedding
Body: {
  "embedding": [0.1, 0.2, ...],  // Float array
  "threshold": 0.85  // Optional, default 0.85
}
```

#### Register New Employee
```
POST /api/employees/register
Body: {
  "employeeCode": "EMP001",
  "name": "John Doe",
  "department": "Engineering",
  "embedding": [0.1, 0.2, ...],  // Optional
  "faceId": "azure-face-id"  // Optional
}
```

#### Get Employee
```
GET /api/employees/{employeeId}
```

#### Update Employee
```
PUT /api/employees/{employeeId}
Body: {
  "name": "Updated Name",
  "department": "New Department",
  "faceId": "new-face-id",
  "embedding": [...]
}
```

#### List All Employees
```
GET /api/employees?department=Engineering&isActive=true
```

### Attendance Endpoints

#### Record Attendance
```
POST /api/attendance/record
Body: {
  "employeeId": "uuid",
  "checkType": "IN",  // or "OUT"
  "timestamp": 1234567890,  // Unix timestamp in ms
  "deviceId": "device-123",
  "location": "Office",  // Optional
  "mode": "ONLINE"  // or "OFFLINE"
}
```

#### Sync Offline Records
```
POST /api/attendance/sync
Body: [
  {
    "id": "uuid",
    "employeeId": "uuid",
    "checkType": "IN",
    "timestamp": 1234567890,
    "deviceId": "device-123",
    "location": "Office"
  },
  ...
]
```

#### Get Attendance History
```
GET /api/attendance/history?employeeId=uuid&days=30
```

#### Get Daily Summary
```
GET /api/attendance/daily-summary?date=2024-01-15
```

#### Get Employee Statistics
```
GET /api/attendance/stats/{employeeId}?month=1&year=2024
```

### Health Check
```
GET /health
```

## Deployment to Azure

### Option 1: Azure App Service

1. Create an Azure App Service
2. Set up Azure Database for PostgreSQL
3. Configure environment variables in App Service
4. Deploy using Git or GitHub Actions

### Option 2: Azure Container Instances

1. Create a Dockerfile:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

2. Build and push to Azure Container Registry
3. Deploy to Azure Container Instances

### Option 3: Local Development with ngrok

For testing with the Android app:
1. Install ngrok: `npm install -g ngrok`
2. Start your server: `npm start`
3. Expose it: `ngrok http 3000`
4. Use the ngrok URL in your Android app

## Update Android App

In your Android app, update `PostgresApiService.kt`:

```kotlin
companion object {
    // For local testing with ngrok
    const val API_BASE_URL = "https://your-ngrok-url.ngrok.io/api"
    
    // For production
    // const val API_BASE_URL = "https://your-app.azurewebsites.net/api"
    
    const val API_KEY = "your-secret-api-key-here"
}
```

## Security Notes

1. Always use HTTPS in production
2. Keep API keys secure and rotate regularly
3. Implement rate limiting for production
4. Add input validation and sanitization
5. Use environment variables for sensitive data
6. Enable CORS only for trusted origins
7. Consider implementing JWT for more robust authentication

## Testing

Test the API using curl:

```bash
# Health check
curl http://localhost:3000/health

# Register employee
curl -X POST http://localhost:3000/api/employees/register \
  -H "Authorization: Bearer your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeCode": "EMP001",
    "name": "Test User",
    "department": "IT"
  }'
```

## Troubleshooting

1. **Database connection issues:**
   - Check PostgreSQL is running
   - Verify credentials in .env
   - Ensure database exists

2. **API key errors:**
   - Check Authorization header format
   - Verify API_KEY in .env matches request

3. **CORS issues:**
   - Add your frontend URL to ALLOWED_ORIGINS in .env

## License

MIT
const fetch = require('node-fetch');

// Test configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TRIAL_KEY = 'SAT-TRIAL-2025-CLIENT-TEST';

// Test device data
const testDevice1 = {
  deviceId: 'test-device-001-hash',
  deviceModel: 'Test Phone 1',
  androidVersion: 33,
  appVersion: '1.0.0',
  trialKey: TRIAL_KEY,
  timestamp: Date.now()
};

const testDevice2 = {
  deviceId: 'test-device-002-hash',
  deviceModel: 'Test Phone 2',
  androidVersion: 34,
  appVersion: '1.0.0',
  trialKey: TRIAL_KEY,
  timestamp: Date.now()
};

const testDevice3 = {
  deviceId: 'test-device-003-hash',
  deviceModel: 'Test Phone 3',
  androidVersion: 31,
  appVersion: '1.0.0',
  trialKey: TRIAL_KEY,
  timestamp: Date.now()
};

async function testTrialAPI() {
  console.log('🧪 Testing Trial API Endpoints...\n');

  try {
    // Test 1: Validate first device (should be valid)
    console.log('📱 Test 1: Validate first device');
    let response = await fetch(`${BASE_URL}/api/trial/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDevice1)
    });
    let result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { status: 'valid' }\n`);

    // Test 2: Register first device
    console.log('📱 Test 2: Register first device');
    response = await fetch(`${BASE_URL}/api/trial/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDevice1)
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { success: true, message: 'Device registered successfully' }\n`);

    // Test 3: Validate first device again (should still be valid)
    console.log('📱 Test 3: Validate first device again');
    response = await fetch(`${BASE_URL}/api/trial/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDevice1)
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { status: 'valid' }\n`);

    // Test 4: Register second device
    console.log('📱 Test 4: Register second device');
    response = await fetch(`${BASE_URL}/api/trial/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDevice2)
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { success: true, message: 'Device registered successfully' }\n`);

    // Test 5: Try to validate third device (should exceed limit)
    console.log('📱 Test 5: Validate third device (should exceed limit)');
    response = await fetch(`${BASE_URL}/api/trial/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDevice3)
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { status: 'device_limit_exceeded' }\n`);

    // Test 6: Try to register third device (should fail)
    console.log('📱 Test 6: Try to register third device');
    response = await fetch(`${BASE_URL}/api/trial/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDevice3)
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { success: false, message: 'Device limit exceeded...' }\n`);

    // Test 7: Get trial status
    console.log('📊 Test 7: Get trial status');
    response = await fetch(`${BASE_URL}/api/trial/status/${TRIAL_KEY}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result, null, 2)}`);
    console.log(`✅ Expected: Status with 2 devices registered\n`);

    // Test 8: Delete a device
    console.log('🗑️ Test 8: Delete first test device');
    response = await fetch(`${BASE_URL}/api/trial/device/${testDevice1.deviceId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { success: true, message: 'Device removed successfully' }\n`);

    // Test 9: Now third device should be able to register
    console.log('📱 Test 9: Register third device after deletion');
    response = await fetch(`${BASE_URL}/api/trial/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDevice3)
    });
    result = await response.json();
    console.log(`Result: ${JSON.stringify(result)}`);
    console.log(`✅ Expected: { success: true, message: 'Device registered successfully' }\n`);

    console.log('🎉 All tests completed!');

    // Cleanup: Delete test devices
    console.log('\n🧹 Cleaning up test devices...');
    await fetch(`${BASE_URL}/api/trial/device/${testDevice2.deviceId}`, { method: 'DELETE' });
    await fetch(`${BASE_URL}/api/trial/device/${testDevice3.deviceId}`, { method: 'DELETE' });
    console.log('✅ Test devices cleaned up');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

// Check if fetch is available, if not install node-fetch
if (typeof fetch === 'undefined') {
  console.log('⚠️ node-fetch not found. Install it with: npm install node-fetch');
  console.log('Or run this test in a browser console');
  process.exit(1);
}

// Run tests
testTrialAPI();
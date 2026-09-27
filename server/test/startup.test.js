const assert = require('node:assert/strict');
const path = require('node:path');
const { after, before, test } = require('node:test');

process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH = path.join(
  'test',
  'fixtures',
  'missing-service-account.json'
);

const { startServer } = require('../index');

let server;
let baseUrl;

before(async () => {
  server = startServer(0);

  if (!server.listening) {
    await new Promise((resolve) => server.once('listening', resolve));
  }

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('GET /health returns 200 without Firebase credentials', async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('Firebase-dependent routes return a controlled 503 without credentials', async () => {
  const response = await fetch(`${baseUrl}/api/users/test-user`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'Firebase Admin is unavailable',
    code: 'FIREBASE_UNAVAILABLE',
  });
});

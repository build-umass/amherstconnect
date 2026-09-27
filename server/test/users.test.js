const assert = require('node:assert/strict');
const path = require('node:path');
const { after, beforeEach, test } = require('node:test');

process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH = path.join(
  'test',
  'fixtures',
  'missing-service-account.json'
);

const firebase = require('../config/firebase');
const { getUser, updateUser } = require('../controllers/users');

const originalDb = firebase.db;
let calls;

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function installFakeDb() {
  calls = { collection: 0, get: 0, update: 0, updateData: null };
  firebase.db = {
    collection(name) {
      calls.collection += 1;
      assert.equal(name, 'users');
      return {
        doc(uid) {
          assert.equal(uid, 'alice');
          return {
            async get() {
              calls.get += 1;
              return {
                exists: true,
                data: () => ({ uid: 'alice', displayName: 'Alice' }),
              };
            },
            async update(data) {
              calls.update += 1;
              calls.updateData = data;
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  installFakeDb();
});

after(() => {
  firebase.db = originalDb;
});

test('an authenticated user can read their own user document', async () => {
  const res = createResponse();

  await getUser({ user: { uid: 'alice' }, params: { uid: 'alice' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { uid: 'alice', displayName: 'Alice' });
  assert.equal(calls.get, 1);
});

test('an authenticated user cannot read another user document', async () => {
  const res = createResponse();

  await getUser({ user: { uid: 'bob' }, params: { uid: 'alice' } }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Cannot access another user' });
  assert.equal(calls.collection, 0);
});

test('an authenticated user can update explicitly allowed fields', async () => {
  const res = createResponse();
  const body = {
    displayName: 'Alice A.',
    interests: ['Sports'],
    notificationPrefs: { newEvents: true, savedReminders: false },
  };

  await updateUser(
    { user: { uid: 'alice' }, params: { uid: 'alice' }, body },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(calls.update, 1);
  assert.equal(calls.updateData.displayName, body.displayName);
  assert.deepEqual(calls.updateData.interests, body.interests);
  assert.deepEqual(calls.updateData.notificationPrefs, body.notificationPrefs);
  assert.ok(calls.updateData.updatedAt instanceof Date);
  assert.deepEqual(Object.keys(calls.updateData).sort(), [
    'displayName',
    'interests',
    'notificationPrefs',
    'updatedAt',
  ]);
});

test('an authenticated user cannot update another user document', async () => {
  const res = createResponse();

  await updateUser(
    {
      user: { uid: 'bob' },
      params: { uid: 'alice' },
      body: { displayName: 'Not Alice' },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Cannot access another user' });
  assert.equal(calls.collection, 0);
});

for (const field of [
  'uid',
  'email',
  'role',
  'eduVerified',
  'authProvider',
  'createdAt',
  'updatedAt',
]) {
  test(`rejects client updates to protected field ${field}`, async () => {
    const res = createResponse();

    await updateUser(
      {
        user: { uid: 'alice' },
        params: { uid: 'alice' },
        body: { [field]: 'forbidden' },
      },
      res
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: 'Unsupported user update fields',
      fields: [field],
    });
    assert.equal(calls.collection, 0);
  });
}

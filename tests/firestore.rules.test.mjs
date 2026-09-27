import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const projectId = 'demo-amherst-connect';
let testEnv;

const users = {
  alice: { uid: 'alice', role: 'student' },
  bob: { uid: 'bob', role: 'faculty_staff' },
  carol: { uid: 'carol', role: 'alumni' },
  dave: { uid: 'dave', role: 'local_resident' },
};

function userData(uid, role) {
  return {
    uid,
    email: `${uid}@example.com`,
    role,
    displayName: uid,
    photoURL: null,
    eduVerified: false,
    interests: ['Dining'],
    authProvider: 'email',
    onboardingComplete: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function authedDb(uid) {
  return testEnv.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();
}

function unauthenticatedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      ...Object.values(users).map(({ uid, role }) => setDoc(doc(db, 'users', uid), userData(uid, role))),
      setDoc(doc(db, 'events', 'event-1'), {
        title: 'Campus Concert',
        category: 'Arts & Music',
        date: 'Sat, Apr 26',
        time: '6:00 PM',
        location: 'The Common',
        emoji: '🎵',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        start_time: new Date('2026-04-26T22:00:00Z'),
      }),
      setDoc(doc(db, 'bookmarks', 'alice-bookmark'), {
        userId: 'alice', eventId: 'event-1', createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
      setDoc(doc(db, 'rsvps', 'alice-rsvp'), { userId: 'alice', eventId: 'event-1' }),
      setDoc(doc(db, 'notifications', 'alice-notification'), {
        userId: 'alice', type: 'new_event_match', eventId: 'event-1',
        title: 'New event for you', body: 'Campus Concert', read: false,
        createdAt: new Date('2026-01-03T00:00:00Z'),
      }),
      setDoc(doc(db, 'deals', 'deal-1'), {
        title: 'Student deal', discountCode: 'SECRET',
      }),
      setDoc(doc(db, 'edu_verifications', 'verification-1'), {
        uid: 'alice', eduEmail: 'alice@amherst.edu', code: '123456', verified: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-01-01T00:10:00Z'),
      }),
    ]);
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe('users', () => {
  test('allows a signed-in user to create and read their exact mobile user shape', async () => {
    const db = authedDb('new-user');
    const ref = doc(db, 'users', 'new-user');
    await assertSucceeds(setDoc(ref, {
      ...userData('new-user', 'student'),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(getDoc(ref));
  });

  test('allows current mobile profile, interest, onboarding, token, and preference updates', async () => {
    const ref = doc(authedDb('alice'), 'users', 'alice');
    await assertSucceeds(updateDoc(ref, {
      displayName: 'Alice A.',
      photoURL: 'https://example.com/alice.jpg',
      interests: ['Sports'],
      onboardingComplete: true,
      expoPushToken: 'ExponentPushToken[test]',
      notificationPrefs: { newEvents: true, savedReminders: false },
      updatedAt: serverTimestamp(),
    }));
  });

  test('denies unauthenticated/cross-user reads, privileged updates, and deletion', async () => {
    const aliceRefForBob = doc(authedDb('bob'), 'users', 'alice');
    await assertFails(getDoc(doc(unauthenticatedDb(), 'users', 'alice')));
    await assertFails(getDoc(aliceRefForBob));
    await assertFails(updateDoc(doc(authedDb('alice'), 'users', 'alice'), {
      role: 'faculty_staff', updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(authedDb('alice'), 'users', 'alice'), {
      eduVerified: true, updatedAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(doc(authedDb('alice'), 'users', 'alice')));
  });
});

describe('role profiles', () => {
  const cases = [
    ['student_profiles', 'alice', { uid: 'alice', eduVerified: false, eduEmail: null, major: null, gradYear: null }],
    ['faculty_staff_profiles', 'bob', { uid: 'bob', department: null, title: null }],
    ['alumni_profiles', 'carol', { uid: 'carol', gradYear: null, major: null }],
    ['resident_profiles', 'dave', { uid: 'dave', neighborhood: null }],
  ];

  for (const [collectionName, uid, profile] of cases) {
    test(`allows owner creation/read for ${collectionName}`, async () => {
      const ref = doc(authedDb(uid), collectionName, uid);
      await assertSucceeds(setDoc(ref, { ...profile, createdAt: serverTimestamp() }));
      await assertSucceeds(getDoc(ref));
      await assertFails(getDoc(doc(authedDb('new-user'), collectionName, uid)));
      await assertFails(updateDoc(ref, { uid }));
      await assertFails(deleteDoc(ref));
    });
  }

  test('denies creating a profile that does not match the user role', async () => {
    await assertFails(setDoc(doc(authedDb('alice'), 'alumni_profiles', 'alice'), {
      uid: 'alice', gradYear: null, major: null, createdAt: serverTimestamp(),
    }));
  });
});

describe('events', () => {
  test('allows authenticated reads and denies unauthenticated reads and all client writes', async () => {
    await assertSucceeds(getDocs(collection(authedDb('alice'), 'events')));
    await assertFails(getDoc(doc(unauthenticatedDb(), 'events', 'event-1')));
    await assertFails(setDoc(doc(authedDb('alice'), 'events', 'event-2'), { title: 'Unauthorized' }));
    await assertFails(updateDoc(doc(authedDb('alice'), 'events', 'event-1'), { title: 'Changed' }));
    await assertFails(deleteDoc(doc(authedDb('alice'), 'events', 'event-1')));
  });
});

describe('bookmarks', () => {
  test('allows the mobile create/query/delete flow for the owner', async () => {
    const db = authedDb('alice');
    const newRef = doc(collection(db, 'bookmarks'));
    await assertSucceeds(setDoc(newRef, {
      userId: 'alice', eventId: 'event-1', createdAt: serverTimestamp(),
    }));
    await assertSucceeds(getDocs(query(
      collection(db, 'bookmarks'),
      where('userId', '==', 'alice'),
      orderBy('createdAt', 'desc'),
    )));
    await assertSucceeds(getDocs(query(
      collection(db, 'bookmarks'),
      where('userId', '==', 'alice'),
      where('eventId', '==', 'event-1'),
    )));
    await assertSucceeds(deleteDoc(newRef));
  });

  test('denies cross-user access, spoofed ownership, missing events, and client updates', async () => {
    const aliceDb = authedDb('alice');
    const bobDb = authedDb('bob');
    await assertFails(getDoc(doc(bobDb, 'bookmarks', 'alice-bookmark')));
    await assertFails(getDocs(query(collection(bobDb, 'bookmarks'), where('userId', '==', 'alice'))));
    await assertFails(setDoc(doc(collection(aliceDb, 'bookmarks')), {
      userId: 'bob', eventId: 'event-1', createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(collection(aliceDb, 'bookmarks')), {
      userId: 'alice', eventId: 'missing-event', createdAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(aliceDb, 'bookmarks', 'alice-bookmark'), {
      remindedAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(doc(bobDb, 'bookmarks', 'alice-bookmark')));
  });
});

describe('rsvps', () => {
  test('allows only owner reads and denies every client write', async () => {
    const aliceDb = authedDb('alice');
    await assertSucceeds(getDocs(query(collection(aliceDb, 'rsvps'), where('userId', '==', 'alice'))));
    await assertFails(getDoc(doc(authedDb('bob'), 'rsvps', 'alice-rsvp')));
    await assertFails(setDoc(doc(collection(aliceDb, 'rsvps')), { userId: 'alice', eventId: 'event-1' }));
    await assertFails(updateDoc(doc(aliceDb, 'rsvps', 'alice-rsvp'), { eventId: 'event-2' }));
    await assertFails(deleteDoc(doc(aliceDb, 'rsvps', 'alice-rsvp')));
  });
});

describe('notifications', () => {
  test('allows owner reads and a read=false to read=true transition only', async () => {
    const ref = doc(authedDb('alice'), 'notifications', 'alice-notification');
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { read: true }));
    const snap = await assertSucceeds(getDoc(ref));
    assert.equal(snap.data().read, true);
  });

  test('denies cross-user access, creation, content edits, reversal, and deletion', async () => {
    const aliceDb = authedDb('alice');
    const ref = doc(aliceDb, 'notifications', 'alice-notification');
    await assertFails(getDoc(doc(authedDb('bob'), 'notifications', 'alice-notification')));
    await assertFails(setDoc(doc(collection(aliceDb, 'notifications')), {
      userId: 'alice', read: false,
    }));
    await assertFails(updateDoc(ref, { body: 'Changed', read: true }));
    await assertSucceeds(updateDoc(ref, { read: true }));
    await assertFails(updateDoc(ref, { read: false }));
    await assertFails(deleteDoc(ref));
  });
});

describe('deals and education verification', () => {
  test('denies every client operation on deals', async () => {
    const db = authedDb('alice');
    const ref = doc(db, 'deals', 'deal-1');
    await assertFails(getDoc(ref));
    await assertFails(setDoc(doc(db, 'deals', 'deal-2'), { title: 'Deal' }));
    await assertFails(updateDoc(ref, { title: 'Changed' }));
    await assertFails(deleteDoc(ref));
  });

  test('denies every client operation on verification documents', async () => {
    const db = authedDb('alice');
    const ref = doc(db, 'edu_verifications', 'verification-1');
    await assertFails(getDoc(ref));
    await assertFails(setDoc(doc(db, 'edu_verifications', 'verification-2'), {
      uid: 'alice', code: '999999', verified: false,
    }));
    await assertFails(updateDoc(ref, { verified: true }));
    await assertFails(deleteDoc(ref));
  });
});

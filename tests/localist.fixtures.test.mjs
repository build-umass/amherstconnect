
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixtureDir = new URL('./fixtures/localist/', import.meta.url);

const fixtures = {
  normal: 'normal.json',
  recurring: 'recurring.json',
  allDay: 'all-day.json',
  incomplete: 'incomplete.json',
  cancelled: 'cancelled.json',
};

for (const [type, filename] of Object.entries(fixtures)) {
  test(`${type} Localist fixture is valid`, () => {
    const file = new URL(filename, fixtureDir);
    const data = JSON.parse(readFileSync(file, 'utf8'));

    assert.ok(Array.isArray(data.events));
    assert.ok(data.events.length > 0);

    for (const wrapper of data.events) {
      const event = wrapper.event;

      assert.ok(event);
      assert.ok(Number.isSafeInteger(event.id));
      assert.equal(typeof event.title, 'string');
      assert.ok(event.title.length > 0);
      assert.ok(Array.isArray(event.event_instances));

      for (const { event_instance: instance } of event.event_instances) {
        assert.equal(instance.event_id, event.id);
        assert.ok(!Number.isNaN(Date.parse(instance.start)));

        // Some Localist events do not provide an end time.
        assert.ok(
          instance.end == null ||
          (typeof instance.end === 'string' &&
            !Number.isNaN(Date.parse(instance.end)))
        );

        assert.equal(typeof instance.all_day, 'boolean');
      }

      if (type === 'recurring') {
        assert.equal(event.recurring, true);

        const instances = event.event_instances.map(
          ({ event_instance }) => event_instance
        );

        // Check for multiple occurrences.
        assert.ok(instances.length >= 2);

        // Check that occurrence IDs are unique.
        const ids = instances.map(instance => instance.id);
        assert.ok(ids.every(id => Number.isSafeInteger(id)));
        assert.equal(new Set(ids).size, instances.length);

        // Check that occurrences happen on different dates.
        const dates = instances.map(instance => instance.start.slice(0, 10));
        assert.ok(new Set(dates).size >= 2);

        // Check that each occurrence belongs to the event.
        assert.ok(instances.every(instance => instance.event_id === event.id));
      }

      if (type === 'allDay') {
        assert.ok(
          event.event_instances.some(
            ({ event_instance }) => event_instance.all_day === true
          )
        );
      }

      if (type === 'incomplete') {
        assert.ok(
          event.ticket_url == null || event.ticket_url === ''
        );
      }

      if (type === 'normal') {
        assert.equal(event.recurring, false);
        assert.ok(
          event.event_instances.every(
            ({ event_instance }) => event_instance.all_day === false
          )
        );
      }

      if (type === 'cancelled') {
        assert.equal(event.status, 'canceled');
      }
    }
  });
}

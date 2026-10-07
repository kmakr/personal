import test from 'node:test';
import assert from 'node:assert/strict';
import { publicData, seal, unseal } from '../cloud/public-data.js';
test('public response only contains health display fields', () => {
  const input = {
    fetchedAt: '2026-09-22T00:00:00Z',
    tokens: { refresh_token: 'secret' },
    email: 'private@example.com',
    days: [
      {
        date: '2026-09-22',
        steps: 1234,
        hrv: 42,
        access_token: 'secret',
        sleep: {
          name: 'users/private-id',
          interval: {
            startTime: 'start',
            endTime: 'end',
            privateField: 'secret',
          },
          summary: { minutesAsleep: '400', secret: 'secret' },
          stages: [
            {
              type: 'DEEP',
              startTime: 'start',
              endTime: 'end',
              secret: 'secret',
            },
          ],
        },
      },
    ],
  };
  const result = publicData(input);
  assert.equal(result.days[0].steps, 1234);
  assert.equal(result.days[0].oxygen, null);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(result.days[0].sleep.summary.minutesAsleep, '400');
});
test('cloud credential encryption round-trips and rejects another key', async () => {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const encrypted = await seal({ refresh_token: 'private-token' }, key);
  assert.ok(!JSON.stringify(encrypted).includes('private-token'));
  assert.deepEqual(await unseal(encrypted, key), {
    refresh_token: 'private-token',
  });
  await assert.rejects(unseal(encrypted, Buffer.alloc(32).toString('base64')));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { AutoSync } from './auto-sync';

test('rapid saves coalesce, concurrent edits run again, manual checks share the active run', async () => {
  let calls = 0, release!: () => void;
  const sync = new AutoSync({ ready: () => true, delayMs: 5, onError: () => {}, run: async () => {
    calls++;
    if (calls === 1) await new Promise<void>((resolve) => { release = resolve; });
    return { pushed: 1, pulled: 0 };
  } });
  try {
    sync.schedule(); sync.schedule(); sync.schedule();
    await wait(15);
    assert.equal(calls, 1);
    const first = sync.flush(); assert.equal(sync.flush(), first);
    sync.schedule(); release();
    assert.equal((await first).pushed, 2);
    assert.equal(calls, 2);
  } finally { sync.dispose(); }
});

test('failed automatic upload retries pending changes', async () => {
  let calls = 0;
  const sync = new AutoSync({ ready: () => true, retryMs: 5, onError: () => {}, run: async () => {
    if (++calls === 1) throw new Error('offline');
    return { pushed: 1, pulled: 0 };
  } });
  try {
    await assert.rejects(sync.flush(), /offline/);
    await wait(20);
    assert.equal(calls, 2);
  } finally { sync.dispose(); }
});

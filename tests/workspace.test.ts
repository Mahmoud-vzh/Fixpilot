import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createWorkspace } from '../src/lib/workspace';
import { draftSession } from '../src/lib/diagnostic/session';

test('Independent browsers do not share sessions, images or reports', async () => {
  const a = createWorkspace(new IDBFactory()),
    b = createWorkspace(new IDBFactory());
  const s = { ...draftSession('demo'), persisted: true, revision: 1 };
  s.messages.push({
    id: crypto.randomUUID(),
    role: 'user',
    text: 'Example observation',
    image: 'data:image/png;base64,AA==',
    created_at: new Date().toISOString(),
  });
  await a.save(s, 0);
  await a.report(s);
  assert.equal((await a.sessions()).length, 1);
  assert.equal((await a.reports()).length, 1);
  assert.deepEqual(await b.sessions(), []);
  assert.deepEqual(await b.reports(), []);
  await a.remove(s.id);
  assert.deepEqual(await a.sessions(), []);
  assert.deepEqual(await a.reports(), []);
});
test('Local revisions reject stale writes; rename and clear stay local', async () => {
  const workspace = createWorkspace(new IDBFactory()),
    s = { ...draftSession('demo'), persisted: true, revision: 1 };
  await workspace.save(s, 0);
  await assert.rejects(workspace.save({ ...s, revision: 2 }, 0), /another tab/);
  const renamed = await workspace.update(s.id, {
    title: 'Laptop screen goes black after startup',
  });
  assert.equal(renamed.title, 'Laptop screen goes black after');
  assert.equal(renamed.revision, 2);
  await workspace.report(renamed);
  await workspace.clear();
  assert.deepEqual(await workspace.sessions(), []);
  assert.deepEqual(await workspace.reports(), []);
});

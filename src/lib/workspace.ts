import { Session } from './diagnostic/types';
import { sessionId, shortTitle } from './diagnostic/session';
export type Report = { id: string; session: Session; created_at: string };
const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          'Browser storage could not save this change. Check available space and browser storage permissions.',
        ),
      );
  });
// Separate IDB factories in tests represent independent browser profiles.
export function createWorkspace(
  factory: IDBFactory = globalThis.indexedDB,
  name = 'fixpilot-workspace',
) {
  let connection: Promise<IDBDatabase> | undefined;
  const open = () =>
    (connection ||= new Promise((resolve, reject) => {
      if (!factory) {
        reject(
          new Error(
            'Browser storage is unavailable. Allow site storage to save diagnoses.',
          ),
        );
        return;
      }
      const r = factory.open(name, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('sessions', { keyPath: 'id' });
        r.result.createObjectStore('reports', { keyPath: 'id' });
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = () => {
        connection = undefined;
        reject(
          new Error(
            'Browser storage is unavailable. Check your browser settings.',
          ),
        );
      };
    }));
  return {
    async sessions(): Promise<Session[]> {
      const db = await open();
      return (
        (await request(
          db.transaction('sessions').objectStore('sessions').getAll(),
        )) as Session[]
      ).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    async reports(): Promise<Report[]> {
      const db = await open();
      return (
        (await request(
          db.transaction('reports').objectStore('reports').getAll(),
        )) as Report[]
      ).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async save(session: Session, expectedRevision: number) {
      const db = await open(),
        tx = db.transaction('sessions', 'readwrite'),
        done = finished(tx),
        store = tx.objectStore('sessions');
      const previous = (await request(store.get(session.id))) as
        Session | undefined;
      if ((previous?.revision || 0) !== expectedRevision) {
        tx.abort();
        await done.catch(() => {});
        throw new Error(
          'This diagnosis changed in another tab. Reopen it from history.',
        );
      }
      store.put(session);
      await done;
    },
    async update(
      id: string,
      changes: { title?: string; resolved?: boolean },
    ): Promise<Session> {
      const db = await open(),
        tx = db.transaction('sessions', 'readwrite'),
        done = finished(tx),
        store = tx.objectStore('sessions');
      const old = (await request(store.get(id))) as Session | undefined;
      if (!old) {
        await done;
        throw new Error('Diagnosis not found in this browser.');
      }
      const next = {
        ...old,
        ...(changes.title !== undefined
          ? { title: shortTitle(changes.title) }
          : {}),
        ...(changes.resolved !== undefined
          ? {
              resolved_at: changes.resolved
                ? new Date().toISOString()
                : undefined,
            }
          : {}),
        revision: old.revision + 1,
        updated_at: new Date().toISOString(),
      };
      store.put(next);
      await done;
      return next;
    },
    async report(session: Session): Promise<Report> {
      const db = await open(),
        tx = db.transaction('reports', 'readwrite'),
        done = finished(tx);
      const report = {
        id: sessionId(),
        session: structuredClone(session),
        created_at: new Date().toISOString(),
      };
      tx.objectStore('reports').put(report);
      await done;
      return report;
    },
    async remove(id: string) {
      const db = await open(),
        tx = db.transaction(['sessions', 'reports'], 'readwrite'),
        done = finished(tx);
      tx.objectStore('sessions').delete(id);
      const reports = (await request(
        tx.objectStore('reports').getAll(),
      )) as Report[];
      for (const r of reports)
        if (r.session.id === id) tx.objectStore('reports').delete(r.id);
      await done;
    },
    async clear() {
      const db = await open(),
        tx = db.transaction(['sessions', 'reports'], 'readwrite'),
        done = finished(tx);
      tx.objectStore('sessions').clear();
      tx.objectStore('reports').clear();
      await done;
    },
  };
}
export const workspace = createWorkspace();

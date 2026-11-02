import { openDB, type IDBPDatabase } from 'idb';

const NAME = 'collage-studio';
const STORES = ['projects', 'assets'] as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

function createStores(d: IDBPDatabase) {
  for (const name of STORES) {
    if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: 'id' });
  }
}

/**
 * Open the database at whatever version it is, creating the stores on first
 * use. A database that exists without them — created by an interrupted first
 * run, a browser tool, or anything else that opened it first — would fail
 * every save, so it's upgraded one version to add them. (A future schema
 * change needs an explicit version and migration of its own.)
 */
async function open(): Promise<IDBPDatabase> {
  const d = await openDB(NAME, undefined, { upgrade: createStores });
  if (STORES.every((name) => d.objectStoreNames.contains(name))) return d;
  const version = d.version + 1;
  d.close();
  return openDB(NAME, version, { upgrade: createStores });
}

function db(): Promise<IDBPDatabase> {
  // A failed open isn't kept: the next call tries again.
  dbPromise ??= open().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

/**
 * A stored photo: its bytes and MIME type, not the Blob itself. Safari refuses
 * any Blob in IndexedDB in a private window ("Error preparing Blob/File data
 * to be stored in object store" — WebKit bugs 188438 and 268037), which failed
 * every save there. Records written before this hold a Blob instead, and are
 * still read.
 */
interface AssetRecord {
  id: string;
  bytes?: ArrayBuffer;
  type?: string;
  blob?: Blob;
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  // Read before the write's transaction opens: it would commit while waiting.
  const record: AssetRecord = { id, type: blob.type, bytes: await blob.arrayBuffer() };
  await (await db()).put('assets', record);
}

export async function hasAsset(id: string): Promise<boolean> {
  return (await (await db()).getKey('assets', id)) !== undefined;
}

export async function getAllAssetKeys(): Promise<string[]> {
  return (await (await db()).getAllKeys('assets')) as string[];
}

export async function deleteAsset(id: string): Promise<void> {
  await (await db()).delete('assets', id);
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  const rec = (await (await db()).get('assets', id)) as AssetRecord | undefined;
  if (rec?.bytes) return new Blob([rec.bytes], { type: rec.type ?? '' });
  return rec?.blob;
}

export async function putProjectRec(project: unknown): Promise<void> {
  await (await db()).put('projects', project);
}

export async function getProjectRec(id: string): Promise<unknown> {
  return (await db()).get('projects', id);
}

export async function getAllProjectRecs(): Promise<unknown[]> {
  return (await db()).getAll('projects');
}

export async function deleteProjectRec(id: string): Promise<void> {
  await (await db()).delete('projects', id);
}

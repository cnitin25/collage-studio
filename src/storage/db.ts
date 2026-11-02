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

export async function putAsset(id: string, blob: Blob): Promise<void> {
  await (await db()).put('assets', { id, blob });
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
  const rec = (await (await db()).get('assets', id)) as { blob: Blob } | undefined;
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

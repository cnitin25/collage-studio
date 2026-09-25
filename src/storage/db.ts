import { openDB, type IDBPDatabase } from 'idb';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('collage-studio', 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('projects')) {
          d.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('assets')) {
          d.createObjectStore('assets', { keyPath: 'id' });
        }
      },
    });
  }
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

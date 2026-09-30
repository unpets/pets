import type { CharacterAssets } from '@pets/kernel/assets';
import type { StudioProject } from './studio-project';

export interface PersonaEntry {
  key: string;
  id: string;
  name: string;
  updatedAt: number;
  assetKey: string;
}
type StoredProject = Omit<StudioProject, 'assets'> & { assetKey: string };
const stores = ['personas', 'projects', 'assets', 'settings'];
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('Persona storage transaction aborted.'),
      );
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Assets are stored once and shared by copies; editable documents are separate. */
export class PersonaLibrary {
  private entries = new Map<string, PersonaEntry>();
  private documents = new Map<string, StudioProject>();
  private assets = new Map<string, CharacterAssets>();
  private assetKeys = new WeakMap<CharacterAssets, string>();
  private queue: Promise<unknown> = Promise.resolve();
  active = '';
  private constructor(private database?: IDBDatabase) {}
  static async open(): Promise<PersonaLibrary> {
    const opening = indexedDB.open('pets-studio', 1);
    opening.onupgradeneeded = () => {
      for (const store of stores) opening.result.createObjectStore(store);
    };
    const database = await request(opening);
    const library = new PersonaLibrary(database);
    const transaction = database.transaction(
      ['personas', 'settings'],
      'readonly',
    );
    const [entries, active] = await Promise.all([
      request<PersonaEntry[]>(transaction.objectStore('personas').getAll()),
      request<string | undefined>(
        transaction.objectStore('settings').get('active'),
      ),
    ]);
    entries.forEach((entry) => library.entries.set(entry.key, entry));
    library.active =
      active && library.entries.has(active) ? active : (entries[0]?.key ?? '');
    return library;
  }
  static temporary(): PersonaLibrary {
    return new PersonaLibrary();
  }
  get persistent() {
    return !!this.database;
  }
  list(): PersonaEntry[] {
    return [...this.entries.values()];
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {});
    return next;
  }
  async get(key: string): Promise<StudioProject> {
    await this.queue;
    const cached = this.documents.get(key);
    if (cached) return cached;
    if (!this.database || !this.entries.has(key))
      throw new Error('Persona not found.');
    const stored = await request<StoredProject>(
      this.database.transaction('projects').objectStore('projects').get(key),
    );
    const { assetKey, ...document } = stored;
    const assets =
      this.assets.get(assetKey) ??
      (await request<CharacterAssets>(
        this.database.transaction('assets').objectStore('assets').get(assetKey),
      ));
    if (!assets)
      throw new Error(
        'Persona assets are missing. Import a saved project to restore them.',
      );
    const project = { ...document, assets };
    this.assets.set(assetKey, assets);
    this.assetKeys.set(assets, assetKey);
    this.documents.set(key, project);
    return project;
  }
  save(key: string, project: StudioProject): Promise<void> {
    project = { ...project };
    delete project.environment;
    return this.serialize(async () => {
      const { assets, ...document } = project;
      const knownAsset = this.assetKeys.get(assets);
      const assetKey = knownAsset ?? crypto.randomUUID();
      const entry = {
        key,
        ...project.persona,
        updatedAt: Date.now(),
        assetKey,
      };
      const oldAsset = this.entries.get(key)?.assetKey;
      if (this.database) {
        const transaction = this.database.transaction(stores, 'readwrite');
        const done = complete(transaction);
        if (!knownAsset)
          transaction.objectStore('assets').put(assets, assetKey);
        transaction.objectStore('projects').put({ ...document, assetKey }, key);
        transaction.objectStore('personas').put(entry, key);
        if (
          oldAsset &&
          oldAsset !== assetKey &&
          !this.list().some(
            (value) => value.key !== key && value.assetKey === oldAsset,
          )
        )
          transaction.objectStore('assets').delete(oldAsset);
        await done;
      }
      this.assets.set(assetKey, assets);
      this.assetKeys.set(assets, assetKey);
      this.entries.set(key, entry);
      this.documents.set(key, project);
    });
  }
  async add(project: StudioProject): Promise<string> {
    const key = crypto.randomUUID();
    await this.save(key, project);
    return key;
  }
  async embedded(project: StudioProject, source: string): Promise<string> {
    const setting = `embedded:${source}`;
    if (this.database) {
      const key = await request<string | undefined>(
        this.database
          .transaction('settings')
          .objectStore('settings')
          .get(setting),
      );
      if (key && this.entries.has(key)) return key;
    }
    const key = await this.add(project);
    if (this.database) {
      const transaction = this.database.transaction('settings', 'readwrite');
      const done = complete(transaction);
      transaction.objectStore('settings').put(key, setting);
      await done;
    }
    return key;
  }
  activate(key: string): Promise<void> {
    return this.serialize(async () => {
      if (!this.entries.has(key)) throw new Error('Persona not found.');
      if (this.database) {
        const transaction = this.database.transaction('settings', 'readwrite');
        const done = complete(transaction);
        transaction.objectStore('settings').put(key, 'active');
        await done;
      }
      this.active = key;
    });
  }
  remove(key: string): Promise<void> {
    return this.serialize(async () => {
      if (key === this.active)
        throw new Error('Switch to another persona before deleting this one.');
      const entry = this.entries.get(key);
      if (!entry) return;
      if (this.database) {
        const transaction = this.database.transaction(
          ['personas', 'projects', 'assets'],
          'readwrite',
        );
        const done = complete(transaction);
        transaction.objectStore('personas').delete(key);
        transaction.objectStore('projects').delete(key);
        if (
          !this.list().some(
            (value) => value.key !== key && value.assetKey === entry.assetKey,
          )
        )
          transaction.objectStore('assets').delete(entry.assetKey);
        await done;
      }
      this.documents.delete(key);
      this.entries.delete(key);
    });
  }
  close() {
    void this.queue.finally(() => this.database?.close());
  }
}

export function personaIdentity(
  name: string,
  entries: PersonaEntry[],
): StudioProject['persona'] {
  name = name.trim();
  if (!name || name.length > 80)
    throw new Error('Use a persona name between 1 and 80 characters.');
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'persona';
  let id = base;
  for (let index = 2; entries.some((entry) => entry.id === id); index++)
    id = `${base}-${index}`;
  return { id, name };
}

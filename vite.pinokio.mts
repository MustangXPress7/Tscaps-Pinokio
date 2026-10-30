import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import baseConfig from './vite.config';

const STORES = ['projects', 'user-templates'] as const;
type StoreName = (typeof STORES)[number];

const DATA_DIR = path.resolve(__dirname, '../../../data');
const TOKEN = randomBytes(16).toString('hex');
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const API_PREFIX = '/__tscaps_persist';

function isStoreName(value: string | null): value is StoreName {
  return value !== null && (STORES as readonly string[]).includes(value);
}

function isLoopback(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function fileNameFor(id: string): string {
  return `${Buffer.from(id, 'utf8').toString('base64url')}.json`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function writeRecord(store: StoreName, record: unknown): Promise<void> {
  const id = (record as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('record id is required');
  const dir = path.join(DATA_DIR, store);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, fileNameFor(id));
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(record)}\n`, 'utf8');
  await fs.rm(target, { force: true });
  await fs.rename(temp, target);
}

async function removeRecord(store: StoreName, id: string): Promise<void> {
  if (!id) return;
  await fs.rm(path.join(DATA_DIR, store, fileNameFor(id)), { force: true });
}

async function readManifest(): Promise<Record<StoreName, unknown[]>> {
  const manifest = {} as Record<StoreName, unknown[]>;
  for (const store of STORES) {
    const dir = path.join(DATA_DIR, store);
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      files = [];
    }
    const records: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        records.push(JSON.parse(await fs.readFile(path.join(dir, file), 'utf8')));
      } catch {
        // Ignore a corrupt snapshot; the next save rewrites it.
      }
    }
    manifest[store] = records;
  }
  return manifest;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(API_PREFIX)) {
    next();
    return;
  }

  if (!isLoopback(req) || req.headers['x-tscaps-token'] !== TOKEN) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === `${API_PREFIX}/manifest`) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(await readManifest()));
      return;
    }

    const store = url.searchParams.get('store');
    if (!isStoreName(store)) {
      res.statusCode = 400;
      res.end('unknown store');
      return;
    }

    if (req.method === 'POST' && url.pathname === `${API_PREFIX}/record`) {
      const record = JSON.parse(await readBody(req));
      await writeRecord(store, record);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'DELETE' && url.pathname === `${API_PREFIX}/record`) {
      await removeRecord(store, url.searchParams.get('id') ?? '');
      res.statusCode = 204;
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err));
  }
}

const CLIENT_SCRIPT = `
const TOKEN = "__TOKEN__";
const API = "${API_PREFIX}";
const DB_NAME = "tscaps";
const STORES = ${JSON.stringify(STORES)};
const HEADERS = { "x-tscaps-token": TOKEN };
let suppressMirror = false;

function request(url, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, HEADERS, opts.headers || {});
  return fetch(url, opts);
}

async function storeIsReady() {
  try {
    if (typeof indexedDB.databases !== "function") return false;
    const databases = await indexedDB.databases();
    const entry = databases.find(function (item) { return item.name === DB_NAME; });
    if (!entry) return false;
    const db = await openDatabase();
    const ready = db.objectStoreNames.contains("projects");
    db.close();
    return ready;
  } catch (e) {
    return false;
  }
}

function openDatabase() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = function () {
      const db = req.result;
      db.onversionchange = function () { db.close(); };
      resolve(db);
    };
    req.onerror = function () { reject(req.error); };
  });
}

function readAllStore(db, storeName) {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = function () { resolve(req.result || []); };
    req.onerror = function () { reject(req.error); };
  });
}

function transactionDone(tx) {
  return new Promise(function (resolve, reject) {
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error); };
  });
}

function toBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encodeValue(value) {
  if (value instanceof Blob) {
    const type = value.type || "application/octet-stream";
    if (value.size <= 2 * 1024 * 1024) {
      return { __tscaps_blob: true, type: type, base64: toBase64(await value.arrayBuffer()) };
    }
    return { __tscaps_blob: true, type: type, omitted: true };
  }
  if (value instanceof Date) return { __tscaps_date: value.toISOString() };
  if (Array.isArray(value)) {
    const result = [];
    for (let i = 0; i < value.length; i += 1) result.push(await encodeValue(value[i]));
    return result;
  }
  if (value && typeof value === "object") {
    const result = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) result[keys[i]] = await encodeValue(value[keys[i]]);
    return result;
  }
  return value;
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return value;
  if (value.__tscaps_blob) {
    if (value.omitted || typeof value.base64 !== "string") return null;
    return new Blob([fromBase64(value.base64)], { type: value.type || "application/octet-stream" });
  }
  if (value.__tscaps_date) return new Date(value.__tscaps_date);
  if (Array.isArray(value)) return value.map(decodeValue);
  const result = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) result[keys[i]] = decodeValue(value[keys[i]]);
  return result;
}

function timestampOf(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (value.__tscaps_date) return Date.parse(value.__tscaps_date) || 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  return 0;
}

async function saveRecord(store, record) {
  try {
    const id = record && record.id;
    if (!id) return;
    const body = await encodeValue(record);
    await request(API + "/record?store=" + encodeURIComponent(store) + "&id=" + encodeURIComponent(id), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Disk mirroring must never break the editor.
  }
}

async function removeRecord(store, id) {
  try {
    if (!id) return;
    await request(API + "/record?store=" + encodeURIComponent(store) + "&id=" + encodeURIComponent(id), {
      method: "DELETE",
      keepalive: true,
    });
  } catch (e) {
    // Disk mirroring must never break the editor.
  }
}

function installHooks() {
  if (typeof IDBObjectStore === "undefined") return;
  const methods = ["put", "add", "delete"];
  for (let i = 0; i < methods.length; i += 1) {
    const method = methods[i];
    const original = IDBObjectStore.prototype[method];
    if (typeof original !== "function") continue;
    IDBObjectStore.prototype[method] = function (value, key) {
      const storeName = this.name;
      const req = original.apply(this, arguments);
      if (STORES.indexOf(storeName) !== -1) {
        req.addEventListener("success", function () {
          if (suppressMirror) return;
          if (method === "delete") removeRecord(storeName, String(key !== undefined ? key : value));
          else saveRecord(storeName, value);
        });
      }
      return req;
    };
  }
}

async function backupAll(known) {
  let db;
  try { db = await openDatabase(); } catch (e) { return; }
  const pending = [];
  try {
    for (let i = 0; i < STORES.length; i += 1) {
      const storeName = STORES[i];
      if (!db.objectStoreNames.contains(storeName)) continue;
      const knownForStore = (known && known[storeName]) || {};
      const records = await readAllStore(db, storeName);
      for (let j = 0; j < records.length; j += 1) {
        const record = records[j];
        const diskTime = knownForStore[record.id];
        if (diskTime === undefined || timestampOf(record.updatedAt) > diskTime) {
          pending.push({ storeName: storeName, record: record });
        }
      }
    }
  } catch (e) {
    // Ignore transient IndexedDB errors.
  } finally {
    try { db.close(); } catch (e) {}
  }
  for (let i = 0; i < pending.length; i += 1) {
    await saveRecord(pending[i].storeName, pending[i].record);
  }
}

async function restore() {
  const empty = { changed: false, known: {} };
  let manifest = null;
  try {
    const res = await request(API + "/manifest");
    if (res.ok) manifest = await res.json();
  } catch (e) {
    return empty;
  }
  if (!manifest) return empty;

  const known = {};
  for (let i = 0; i < STORES.length; i += 1) {
    const storeName = STORES[i];
    const records = Array.isArray(manifest[storeName]) ? manifest[storeName] : [];
    known[storeName] = {};
    for (let j = 0; j < records.length; j += 1) {
      const record = records[j];
      if (record && record.id) known[storeName][record.id] = timestampOf(record.updatedAt);
    }
  }

  const stores = STORES.filter(function (storeName) {
    return Array.isArray(manifest[storeName]) && manifest[storeName].length > 0;
  });
  if (stores.length === 0) return { changed: false, known };

  let db;
  try { db = await openDatabase(); } catch (e) { return { changed: false, known }; }

  const availableStores = stores.filter(function (storeName) {
    return db.objectStoreNames.contains(storeName);
  });
  if (availableStores.length === 0) {
    db.close();
    return { changed: false, known };
  }

  const writes = [];
  try {
    for (let i = 0; i < availableStores.length; i += 1) {
      const storeName = availableStores[i];
      const local = await readAllStore(db, storeName);
      const byId = {};
      for (let j = 0; j < local.length; j += 1) byId[local[j].id] = local[j];
      const remote = manifest[storeName];
      for (let j = 0; j < remote.length; j += 1) {
        const record = remote[j];
        if (!record || !record.id) continue;
        const existing = byId[record.id];
        if (!existing || timestampOf(record.updatedAt) > timestampOf(existing.updatedAt)) {
          writes.push({ storeName: storeName, record: decodeValue(record) });
        }
      }
    }
  } catch (e) {
    db.close();
    return { changed: false, known };
  }

  if (writes.length === 0) {
    db.close();
    return { changed: false, known };
  }

  let changed = false;
  suppressMirror = true;
  try {
    const storeNames = [];
    for (let i = 0; i < writes.length; i += 1) {
      if (storeNames.indexOf(writes[i].storeName) === -1) storeNames.push(writes[i].storeName);
    }
    const tx = db.transaction(storeNames, "readwrite");
    for (let i = 0; i < writes.length; i += 1) {
      tx.objectStore(writes[i].storeName).put(writes[i].record);
    }
    await transactionDone(tx);
    changed = true;
  } catch (e) {
    changed = false;
  } finally {
    suppressMirror = false;
    try { db.close(); } catch (e) {}
  }
  return { changed, known };
}

function reloadOnce() {
  try {
    if (sessionStorage.getItem("tscaps.persist.reloaded") === "1") return;
    sessionStorage.setItem("tscaps.persist.reloaded", "1");
  } catch (e) {}
  location.reload();
}

installHooks();

if (await storeIsReady()) {
  const result = await restore();
  backupAll(result.known);
} else {
  let attempts = 0;
  const timer = setInterval(async function () {
    attempts += 1;
    if (await storeIsReady()) {
      clearInterval(timer);
      const result = await restore();
      backupAll(result.known);
      if (result.changed) reloadOnce();
    } else if (attempts >= 120) {
      clearInterval(timer);
    }
  }, 500);
}
`;

function tscapsPersistence(): Plugin {
  return {
    name: 'tscaps-persistence',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next);
      });
    },
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: CLIENT_SCRIPT.replace('__TOKEN__', TOKEN),
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

const base = baseConfig as { plugins?: unknown[] };
const plugins = Array.isArray(base.plugins) ? base.plugins : [];

export default defineConfig({
  ...baseConfig,
  plugins: [...plugins, tscapsPersistence()] as never,
});

// ============================================================
//  INDEXEDDB — Local offline storage
//  Stores: staff list, attendance logs, pending sync queue
// ============================================================
const DB_NAME    = 'AyurvedalayaDB';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      // Staff list (synced from server)
      if (!db.objectStoreNames.contains('staff')) {
        const s = db.createObjectStore('staff', { keyPath: 'staffId' });
        s.createIndex('pin', 'pin', { unique: false });
      }
      // All attendance logs (local + synced)
      if (!db.objectStoreNames.contains('logs')) {
        const l = db.createObjectStore('logs', { keyPath: 'logId' });
        l.createIndex('staffId', 'staffId', { unique: false });
        l.createIndex('date', 'date', { unique: false });
        l.createIndex('synced', 'synced', { unique: false });
      }
      // Pending sync queue
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'logId' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbGetByIndex(store, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(store, 'readonly');
    const idx   = tx.objectStore(store).index(indexName);
    const req   = idx.getAll(value);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbClear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = e => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── STAFF HELPERS ─────────────────────────────────────────────
async function getStaffByIdAndPin(staffId, pin) {
  const all = await dbGetAll('staff');
  return all.find(s =>
    String(s.staffId).toUpperCase() === String(staffId).toUpperCase() &&
    String(s.pin) === String(pin) &&
    s.active
  ) || null;
}

async function getAllActiveStaff() {
  const all = await dbGetAll('staff');
  return all.filter(s => s.active);
}

// ── LOG HELPERS ───────────────────────────────────────────────
async function getTodayLogs(staffId) {
  const tz    = 'Asia/Kathmandu';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const all   = await dbGetByIndex('logs', 'staffId', staffId);
  return all.filter(l => l.date === today).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function getLogsForDate(staffId, dateStr) {
  const all = await dbGetByIndex('logs', 'staffId', staffId);
  return all.filter(l => l.date === dateStr).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function getPendingLogs() {
  const all = await dbGetAll('logs');
  return all.filter(l => !l.synced);
}

async function markLogSynced(logId) {
  const log = await dbGet('logs', logId);
  if (log) { log.synced = true; await dbPut('logs', log); }
}

// ── COMPUTE CURRENT STATUS FROM LOCAL LOGS ─────────────────────
async function computeCurrentStatus(staffId) {
  const tz    = 'Asia/Kathmandu';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const logs  = await getLogsForDate(staffId, today);

  let status = 'OFF';
  logs.forEach(l => {
    if (l.action === 'START_DAY') status = 'WORKING';
    else if (l.action === 'TEMP_OUT') status = 'OUTSIDE';
    else if (l.action === 'RETURN')   status = 'WORKING';
    else if (l.action === 'END_DAY')  status = 'OFF';
  });
  return status;
}

// ── COMPUTE TODAY STATS FROM LOCAL LOGS ───────────────────────
async function computeTodayStats(staffId) {
  const tz    = 'Asia/Kathmandu';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  return computeStatsForDate(staffId, today);
}

async function computeStatsForDate(staffId, dateStr) {
  const logs = await getLogsForDate(staffId, dateStr);
  let workMins = 0, outsideMins = 0, firstEntry = '', lastExit = '';
  let workStart = null, outsideStart = null;

  logs.forEach(l => {
    const t = new Date(l.timestamp);
    const timeStr = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
    switch (l.action) {
      case 'START_DAY': workStart = t; firstEntry = timeStr; break;
      case 'TEMP_OUT':
        if (workStart) { workMins += (t - workStart) / 60000; workStart = null; }
        outsideStart = t; break;
      case 'RETURN':
        if (outsideStart) { outsideMins += (t - outsideStart) / 60000; outsideStart = null; }
        workStart = t; break;
      case 'END_DAY':
        if (workStart) { workMins += (t - workStart) / 60000; workStart = null; }
        lastExit = timeStr; break;
    }
  });
  if (workStart) workMins += (new Date() - workStart) / 60000;

  const shiftMins = 10 * 60;
  const baseMins  = Math.min(workMins, shiftMins);
  const otMins    = Math.max(0, workMins - shiftMins);
  return { workMins: Math.round(baseMins), otMins: Math.round(otMins),
           outsideMins: Math.round(outsideMins), firstEntry, lastExit };
}

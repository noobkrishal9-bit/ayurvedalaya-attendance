// ============================================================
//  SYNC ENGINE — pushes offline records to Google Apps Script
//  Auto-detects online status and syncs pending logs
// ============================================================

// ── SET THIS TO YOUR DEPLOYED WEB APP URL ─────────────────────
const GAS_URL = 'YOUR_DEPLOYED_WEBAPP_URL_HERE';  // ← paste your Apps Script URL

let syncInProgress = false;

// Called automatically when browser comes online
window.addEventListener('online',  () => { showSyncStatus('online');  attemptSync(); });
window.addEventListener('offline', () => { showSyncStatus('offline'); });

async function attemptSync() {
  if (syncInProgress || !navigator.onLine) return;
  syncInProgress = true;

  try {
    const pending = await getPendingLogs();
    if (pending.length === 0) { syncInProgress = false; return; }

    showSyncBanner(`Syncing ${pending.length} offline record(s)…`);

    for (const log of pending) {
      try {
        const res = await fetch(GAS_URL + '?action=syncLog', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify(log),
        });
        const data = await res.json();
        if (data.success) {
          await markLogSynced(log.logId);
        }
      } catch (err) {
        console.warn('Sync failed for log', log.logId, err);
        break; // stop if network drops mid-sync
      }
    }

    // Also refresh staff data from server
    await syncStaffFromServer();

    const remaining = await getPendingLogs();
    if (remaining.length === 0) {
      showSyncBanner('✅ All records synced to Google Sheets!', true);
    } else {
      showSyncBanner(`⚠️ ${remaining.length} record(s) still pending.`, false);
    }
  } catch (err) {
    console.error('Sync error:', err);
  } finally {
    syncInProgress = false;
  }
}

async function syncStaffFromServer() {
  if (!navigator.onLine) return;
  try {
    const res  = await fetch(GAS_URL + '?action=getStaffList');
    const data = await res.json();
    if (data.success && data.staff) {
      await dbClear('staff');
      for (const s of data.staff) { await dbPut('staff', s); }
    }
  } catch (err) {
    console.warn('Staff sync failed:', err);
  }
}

function showSyncBanner(msg, autoHide) {
  let el = document.getElementById('syncBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'syncBanner';
    el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
      'background:#1a5c38;color:#fff;padding:10px 20px;border-radius:99px;font-size:13px;' +
      'font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:opacity .3s';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  if (autoHide) {
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }
}

function showSyncStatus(status) {
  let el = document.getElementById('onlineStatus');
  if (!el) return;
  el.textContent  = status === 'online' ? '🟢 Online' : '🔴 Offline — saving locally';
  el.style.color  = status === 'online' ? '#1e7e34' : '#c0392b';
}

// Run sync on page load if online
document.addEventListener('DOMContentLoaded', () => {
  showSyncStatus(navigator.onLine ? 'online' : 'offline');
  if (navigator.onLine) {
    syncStaffFromServer().then(attemptSync);
  }
});

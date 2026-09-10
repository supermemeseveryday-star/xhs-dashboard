/* ── Background Service Worker ── */

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'xhs-clip',
    title: '📕 采集到工作台',
    contexts: ['page', 'link'],
    documentUrlPatterns: ['https://*.xiaohongshu.com/*']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'xhs-clip') {
    chrome.tabs.sendMessage(tab.id, { action: 'extractPage' }, (response) => {
      if (response?.data) {
        saveSource(response.data);
      }
    });
  }
});

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'saveSource') {
    saveSource(msg.data).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error('Save failed:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  }

  if (msg.action === 'getSources') {
    getSources().then(sources => {
      sendResponse({ sources });
    });
    return true;
  }

  if (msg.action === 'getUnsynced') {
    getUnsynced().then(items => {
      sendResponse({ items });
    });
    return true;
  }

  if (msg.action === 'markSynced') {
    markSynced(msg.ids).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.action === 'clearAll') {
    chrome.storage.local.set({ xhs_sources: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function saveSource(data) {
  const result = await chrome.storage.local.get('xhs_sources');
  const sources = result.xhs_sources || [];

  // Dedup by URL
  const exists = sources.findIndex(s => s.url === data.url);
  if (exists >= 0) {
    sources[exists] = { ...sources[exists], ...data, updatedAt: now() };
  } else {
    sources.push({
      ...data,
      _extId: 'ext_' + Date.now(),
      synced: false,
      createdAt: now()
    });
  }

  await chrome.storage.local.set({ xhs_sources: sources });

  // Update badge
  const unsynced = sources.filter(s => !s.synced).length;
  chrome.action.setBadgeText({ text: unsynced ? String(unsynced) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff4d6a' });
}

async function getSources() {
  const result = await chrome.storage.local.get('xhs_sources');
  return result.xhs_sources || [];
}

async function getUnsynced() {
  const sources = await getSources();
  return sources.filter(s => !s.synced);
}

async function markSynced(ids) {
  const sources = await getSources();
  sources.forEach(s => {
    if (ids.includes(s._extId)) s.synced = true;
  });
  await chrome.storage.local.set({ xhs_sources: sources });

  const unsynced = sources.filter(s => !s.synced).length;
  chrome.action.setBadgeText({ text: unsynced ? String(unsynced) : '' });
}

function now() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

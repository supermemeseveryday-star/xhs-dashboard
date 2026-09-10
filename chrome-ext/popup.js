/* ── Popup Script ── */

const $ = s => document.querySelector(s);

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  loadList();
  loadSettings();

  $('#clip-btn').addEventListener('click', clipCurrentPage);
  $('#sync-btn').addEventListener('click', syncToDashboard);
  $('#settings-toggle').addEventListener('click', () => {
    $('#settings-panel').classList.toggle('show');
  });
  $('#save-settings').addEventListener('click', saveSettings);
  $('#clear-all').addEventListener('click', clearAll);
  $('#open-dashboard').addEventListener('click', openDashboard);
});

// ═══════════════════════════════════════
// LOAD LIST
// ═══════════════════════════════════════
async function loadList() {
  chrome.runtime.sendMessage({ action: 'getSources' }, (response) => {
    const sources = response?.sources || [];
    const list = $('#source-list');
    const unsynced = sources.filter(s => !s.synced).length;

    $('#count-info').textContent = `${unsynced} 条待同步 · 共 ${sources.length} 条`;

    if (!sources.length) {
      list.innerHTML = '<div class="empty"><div class="icon">📡</div><p>还没有采集记录</p><p style="font-size:11px;margin-top:4px">在小红书页面点击浮动按钮采集</p></div>';
      return;
    }

    list.innerHTML = [...sources].reverse().map(s => {
      const eng = s.engagement || {};
      return `<div class="item">
        <div class="item-title">${esc(s.title || '无标题')}</div>
        <div class="item-meta">
          <span class="platform">${esc(s.platform || '小红书')}</span>
          <div class="eng">
            ${eng.likes ? `<span>❤️${eng.likes}</span>` : ''}
            ${eng.collects ? `<span>⭐${eng.collects}</span>` : ''}
            ${eng.comments ? `<span>💬${eng.comments}</span>` : ''}
          </div>
          ${s.synced ? '<span class="synced">✓ 已同步</span>' : ''}
        </div>
      </div>`;
    }).join('');
  });
}

// ═══════════════════════════════════════
// CLIP CURRENT PAGE
// ═══════════════════════════════════════
async function clipCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('xiaohongshu.com')) {
    toast('请在小红书页面使用', 'err');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'extractPage' }, (response) => {
    if (response?.data) {
      chrome.runtime.sendMessage({ action: 'saveSource', data: response.data }, (resp) => {
        if (resp?.success) {
          toast('✅ 采集成功');
          loadList();
        } else {
          toast('❌ 采集失败', 'err');
        }
      });
    } else {
      toast('⚠️ 未识别到内容', 'err');
    }
  });
}

// ═══════════════════════════════════════
// SYNC TO DASHBOARD
// ═══════════════════════════════════════
async function syncToDashboard() {
  chrome.runtime.sendMessage({ action: 'getUnsynced' }, async (response) => {
    const items = response?.items || [];
    if (!items.length) {
      toast('没有待同步的内容', 'err');
      return;
    }

    const url = await getDashboardUrl();

    // Try to sync via opening dashboard with data
    // Method 1: PostMessage to dashboard tab
    const dashboardTab = await findDashboardTab(url);

    if (dashboardTab) {
      // Dashboard is open - send via postMessage
      chrome.tabs.sendMessage(dashboardTab.id, {
        action: 'syncSources',
        sources: items
      });
      chrome.runtime.sendMessage({ action: 'markSynced', ids: items.map(i => i._extId) });
      toast(`✅ 已同步 ${items.length} 条`);
      loadList();
    } else {
      // Dashboard not open - open it with data in URL hash
      const dataParam = encodeURIComponent(JSON.stringify(items));
      chrome.tabs.create({ url: `${url}#import=${dataParam}` });
      chrome.runtime.sendMessage({ action: 'markSynced', ids: items.map(i => i._extId) });
      toast(`✅ 已打开工作台同步 ${items.length} 条`);
      loadList();
    }
  });
}

async function findDashboardTab(baseUrl) {
  const tabs = await chrome.tabs.query({});
  return tabs.find(t => t.url && (t.url.startsWith(baseUrl) || t.url.includes('xhs-dashboard')));
}

// ═══════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════
async function loadSettings() {
  const result = await chrome.storage.local.get('xhs_ws_settings');
  const settings = result.xhs_ws_settings || {};
  $('#dashboard-url').value = settings.dashboardUrl || 'http://localhost:8080';
}

async function saveSettings() {
  await chrome.storage.local.set({
    xhs_ws_settings: { dashboardUrl: $('#dashboard-url').value }
  });
  toast('设置已保存');
}

async function getDashboardUrl() {
  const result = await chrome.storage.local.get('xhs_ws_settings');
  return result.xhs_ws_settings?.dashboardUrl || 'http://localhost:8080';
}

async function openDashboard() {
  const url = await getDashboardUrl();
  chrome.tabs.create({ url });
}

async function clearAll() {
  if (!confirm('确认清空所有采集记录？')) return;
  chrome.runtime.sendMessage({ action: 'clearAll' }, () => {
    toast('已清空');
    loadList();
  });
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function esc(s) {
  if (!s) return '';
  const d = document.createElement('span');
  d.textContent = s;
  return d.innerHTML;
}

function toast(msg, type = 'ok') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

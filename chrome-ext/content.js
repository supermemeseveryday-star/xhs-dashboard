/* ── 小红书工作台 信源采集 Content Script ── */

(function() {
  'use strict';

  const DASHBOARD_URL = 'http://localhost:8080'; // Change to your deployed URL

  // ═══════════════════════════════════════
  // FLOATING BUTTON
  // ═══════════════════════════════════════
  function createFloatButton() {
    if (document.getElementById('xhs-workstation-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'xhs-workstation-btn';
    btn.innerHTML = `
      <div class="xhs-ws-icon">📕</div>
      <div class="xhs-ws-tooltip">采集到工作台</div>
    `;
    btn.addEventListener('click', handleFloatClick);
    document.body.appendChild(btn);
  }

  function handleFloatClick() {
    const data = extractPageData();
    if (!data) {
      showNotification('⚠️ 未识别到可采集的内容', 'warn');
      return;
    }
    sendToDashboard(data);
  }

  // ═══════════════════════════════════════
  // PAGE DATA EXTRACTION
  // ═══════════════════════════════════════
  function extractPageData() {
    const url = window.location.href;

    // Post detail page
    if (url.includes('/explore/') || url.includes('/discovery/item/')) {
      return extractPostDetail();
    }

    // Creator center - note analytics
    if (url.includes('creator.xiaohongshu.com')) {
      return extractCreatorData();
    }

    // Feed page - extract hovered/clicked card
    return extractFeedCard();
  }

  function extractPostDetail() {
    try {
      // Try to get from __INITIAL_STATE__ (SSR data)
      const stateScript = document.querySelector('script#__INITIAL_STATE__');
      if (stateScript) {
        try {
          const state = JSON.parse(stateScript.textContent.replace(/undefined/g, 'null'));
          const noteId = window.location.pathname.split('/').pop().split('?')[0];
          const noteData = findNoteInState(state, noteId);
          if (noteData) return noteData;
        } catch(e) {}
      }

      // Fallback: DOM extraction
      const title = document.querySelector('#detail-title')?.textContent?.trim()
        || document.querySelector('.title')?.textContent?.trim()
        || document.querySelector('h1')?.textContent?.trim()
        || document.title.replace(/ - 小红书$/, '').trim();

      const desc = document.querySelector('#detail-desc')?.textContent?.trim()
        || document.querySelector('.desc')?.textContent?.trim()
        || document.querySelector('.note-text')?.textContent?.trim()
        || '';

      // Engagement
      const likeText = getEngagementNum('[class*="like"] [class*="count"]', 'like');
      const collectText = getEngagementNum('[class*="collect"] [class*="count"]', 'collect');
      const commentText = getEngagementNum('[class*="chat"] [class*="count"]', 'comment');

      // Author
      const author = document.querySelector('[class*="author"] [class*="name"]')?.textContent?.trim()
        || document.querySelector('.username')?.textContent?.trim()
        || '';

      // Tags
      const tags = [...document.querySelectorAll('[class*="tag"] a, .hash-tag')].map(el => el.textContent.trim()).filter(Boolean);

      // Images
      const images = [...document.querySelectorAll('.slide-item img, [class*="carousel"] img')].map(img => img.src).filter(Boolean);

      return {
        type: 'source',
        title: title,
        summary: desc.slice(0, 500),
        url: window.location.href.split('?')[0],
        platform: '小红书',
        author: author,
        engagement: {
          likes: parseNum(likeText),
          collects: parseNum(collectText),
          comments: parseNum(commentText)
        },
        tags: tags,
        images: images.slice(0, 3),
        capturedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        sourceType: 'first-hand'
      };
    } catch(e) {
      console.error('[XHS-WS] Extract post failed:', e);
      return null;
    }
  }

  function extractFeedCard() {
    // Try to get data from the last hovered/clicked card
    const cards = document.querySelectorAll('[class*="note-item"], .note-item, [data-note-id]');
    if (!cards.length) return null;

    // Get the most recently interacted card
    const card = cards[0]; // Default to first visible
    const title = card.querySelector('[class*="title"], .title')?.textContent?.trim() || '';
    const author = card.querySelector('[class*="author"], .author')?.textContent?.trim() || '';
    const likes = card.querySelector('[class*="like"] [class*="count"], .like-count')?.textContent?.trim() || '';

    if (!title) return null;

    return {
      type: 'source',
      title: title,
      summary: '',
      url: window.location.href,
      platform: '小红书',
      author: author,
      engagement: { likes: parseNum(likes), collects: 0, comments: 0 },
      tags: [],
      capturedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      sourceType: 'first-hand'
    };
  }

  function extractCreatorData() {
    // Creator center analytics page
    // Look for data tables with note performance
    const rows = document.querySelectorAll('table tbody tr, [class*="row"]');
    const notes = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll('td, [class*="cell"]');
      if (cells.length >= 4) {
        notes.push({
          type: 'review',
          title: cells[0]?.textContent?.trim() || '',
          views: parseNum(cells[1]?.textContent),
          likes: parseNum(cells[2]?.textContent),
          collects: parseNum(cells[3]?.textContent),
          comments: parseNum(cells[4]?.textContent || '0'),
        });
      }
    });

    if (notes.length) {
      return { type: 'batch_review', notes: notes };
    }
    return null;
  }

  // ═══════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════
  function getEngagementNum(selector, fallback) {
    const el = document.querySelector(selector);
    if (el) return el.textContent.trim();

    // Try aria-label
    const ariaEl = document.querySelector(`[aria-label*="${fallback}"]`);
    if (ariaEl) return ariaEl.getAttribute('aria-label');

    // Try all elements with numbers near icons
    const icons = document.querySelectorAll('svg, [class*="icon"]');
    for (const icon of icons) {
      const parent = icon.closest('[class*="like"], [class*="collect"], [class*="chat"], [class*="comment"]');
      if (parent) {
        const num = parent.textContent.match(/[\d.]+[万k]?/i);
        if (num) return num[0];
      }
    }
    return '0';
  }

  function parseNum(text) {
    if (!text) return 0;
    text = String(text).replace(/[^\d.万k]/gi, '');
    if (text.includes('万')) return Math.round(parseFloat(text) * 10000);
    if (text.toLowerCase().includes('k')) return Math.round(parseFloat(text) * 1000);
    return parseInt(text) || 0;
  }

  function findNoteInState(state, noteId) {
    // Recursive search for note data in SSR state
    function search(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.noteId === noteId || obj.id === noteId) return obj;
      for (const val of Object.values(obj)) {
        const found = search(val);
        if (found) return found;
      }
      return null;
    }
    const note = search(state);
    if (!note) return null;

    return {
      type: 'source',
      title: note.title || note.displayTitle || '',
      summary: (note.desc || note.description || '').slice(0, 500),
      url: `https://www.xiaohongshu.com/explore/${noteId}`,
      platform: '小红书',
      author: note.user?.nickname || note.user?.name || '',
      engagement: {
        likes: note.likedCount || note.interactInfo?.likedCount || 0,
        collects: note.collectedCount || note.interactInfo?.collectedCount || 0,
        comments: note.commentCount || note.interactInfo?.commentCount || 0
      },
      tags: (note.tagList || []).map(t => t.name),
      capturedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      sourceType: 'first-hand'
    };
  }

  // ═══════════════════════════════════════
  // SEND TO DASHBOARD
  // ═══════════════════════════════════════
  function sendToDashboard(data) {
    // Save to chrome.storage
    chrome.runtime.sendMessage({
      action: 'saveSource',
      data: data
    }, (response) => {
      if (response?.success) {
        showNotification('✅ 已采集到工作台', 'success');
      } else {
        showNotification('❌ 采集失败', 'error');
      }
    });
  }

  // ═══════════════════════════════════════
  // NOTIFICATION
  // ═══════════════════════════════════════
  function showNotification(msg, type = 'success') {
    const existing = document.getElementById('xhs-ws-notification');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'xhs-ws-notification';
    el.className = `xhs-ws-notif xhs-ws-notif-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);

    setTimeout(() => {
      el.classList.add('xhs-ws-notif-hide');
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  // ═══════════════════════════════════════
  // CONTEXT MENU CLIPPER
  // ═══════════════════════════════════════
  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'extractPage') {
      const data = extractPageData();
      sendResponse({ data });
    }
    if (msg.action === 'ping') {
      sendResponse({ alive: true });
    }
  });

  // ═══════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════
  // Wait for page to load
  function init() {
    createFloatButton();

    // Observe URL changes (SPA)
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(createFloatButton, 1000);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

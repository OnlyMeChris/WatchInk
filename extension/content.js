/* ================================================================
   content.js — WatchInk Main Orchestrator
   Entry point for the Disney+ content script injection.
   Handles: boot, SPA navigation, video detection, state management.
   ================================================================ */

'use strict';

/* ── Namespace bootstrap ────────────────────────────────────────── */
window.WatchInk = window.WatchInk || {};

/* ── Global State ───────────────────────────────────────────────── */
WatchInk.state = {
  roomId:       'INKW-7291',
  roomName:     'Movie Night 🍿',
  username:     'You',
  isHost:       true,
  isSynced:     true,
  videoEl:      null,
  episodeTitle: null,
  participants: [
    { name: 'Alex K.',  isHost: true,  isYou: false, status: 'Watching' },
    { name: 'You',      isHost: false, isYou: true,  status: 'Watching' },
    { name: 'Jordan M.', isHost: false, isYou: false, status: 'Watching' },
  ],
  messages: [],
};

/* ── Internal Refs ──────────────────────────────────────────────── */
let _videoObserver   = null;
let _urlObserver     = null;
let _resizeObserver  = null;
let _currentUrl      = location.href;
let _videoCheckTimer = null;
let _mounted         = false;

/* ================================================================
   BOOT
   ================================================================ */
function boot() {
  if (_mounted) return;
  _mounted = true;

  document.body.classList.add('wi-active');

  /* Mount UI components */
  WatchInk.TopBar.mount();
  WatchInk.Sidebar.mount();
  WatchInk.Chat.mount();
  WatchInk.Controls.mount();

  /* Populate initial state */
  WatchInk.TopBar.updateRoom(WatchInk.state.roomName);
  WatchInk.Sidebar.updateRoomCode(WatchInk.state.roomId);
  WatchInk.Sidebar.renderParticipants();

  /* Start video detection */
  detectVideo();

  /* Monitor URL for SPA navigation */
  watchUrl();

  /* Resize handler */
  window.addEventListener('resize', onResize);

  /* Open socket / signalling in a real app here */
  console.log('[WatchInk] Mounted on', location.hostname);
}

/* ================================================================
   TEARDOWN
   ================================================================ */
function teardown() {
  if (!_mounted) return;
  _mounted = false;

  WatchInk.TopBar.unmount();
  WatchInk.Sidebar.unmount();
  WatchInk.Chat.unmount();
  WatchInk.Controls.unmount();

  document.body.classList.remove('wi-active', 'wi-sidebar-open');

  _videoObserver?.disconnect();
  _urlObserver?.disconnect();
  _resizeObserver?.disconnect();
  clearTimeout(_videoCheckTimer);

  window.removeEventListener('resize', onResize);
  console.log('[WatchInk] Unmounted');
}

/* ================================================================
   VIDEO DETECTION
   ================================================================ */
function detectVideo() {
  /* Try immediately */
  tryAttachVideo();

  /* Observe DOM mutations for late-loading video elements */
  _videoObserver = new MutationObserver(() => {
    if (!WatchInk.state.videoEl) tryAttachVideo();
  });

  _videoObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  /* Fallback polling for stubborn SPAs */
  let attempts = 0;
  const poll = () => {
    if (WatchInk.state.videoEl) return;
    if (attempts++ > 30) return;
    tryAttachVideo();
    _videoCheckTimer = setTimeout(poll, 1000);
  };
  _videoCheckTimer = setTimeout(poll, 500);
}

function tryAttachVideo() {
  const video = document.querySelector('video');
  if (!video || WatchInk.state.videoEl === video) return;

  WatchInk.state.videoEl = video;
  console.log('[WatchInk] Video element found');

  /* Attach playback listeners */
  video.addEventListener('play',   onVideoPlay);
  video.addEventListener('pause',  onVideoPause);
  video.addEventListener('seeked', onVideoSeeked);

  /* Position overlay on the video */
  WatchInk.Controls.positionOverlay();
  WatchInk.Controls.updatePlayIcon();

  /* Detect episode title from page */
  detectEpisodeMeta();
}

/* ================================================================
   VIDEO EVENT HANDLERS
   ================================================================ */
function onVideoPlay() {
  WatchInk.state.isSynced = true;
  WatchInk.TopBar.updateSync(true);
  WatchInk.Controls.updatePlayIcon();
}

function onVideoPause() {
  WatchInk.Controls.updatePlayIcon();
}

function onVideoSeeked() {
  WatchInk.state.isSynced = false;
  WatchInk.TopBar.updateSync(false);
  /* Re-sync after brief delay to allow host to sync */
  clearTimeout(WatchInk._resyncTimer);
  WatchInk._resyncTimer = setTimeout(() => {
    WatchInk.state.isSynced = true;
    WatchInk.TopBar.updateSync(true);
  }, 3000);
}

/* ================================================================
   EPISODE / META DETECTION
   ================================================================ */
function detectEpisodeMeta() {
  /* Disney+ title selectors — best-effort, may vary with DOM updates */
  const TITLE_SELECTORS = [
    '[data-testid="title-field-series-title"]',
    '[data-testid="title-field-title"]',
    '[class*="SeriesTitle"]',
    '[class*="title--series"]',
    '[class*="video-title"]',
    'h1[class*="title"]',
    '.title-details__title',
    '[class*="DetailTitle"]',
    'meta[property="og:title"]',
  ];

  let title = null;

  for (const sel of TITLE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) {
      title = el.tagName === 'META' ? el.getAttribute('content') : el.textContent?.trim();
      if (title) break;
    }
  }

  /* Fallback: document title */
  if (!title) {
    const docTitle = document.title.replace(/\s*[|\-–—].*$/, '').trim();
    if (docTitle && docTitle.toLowerCase() !== 'disney+') title = docTitle;
  }

  if (title && title !== WatchInk.state.episodeTitle) {
    WatchInk.state.episodeTitle = title;
    WatchInk.TopBar.updateEpisode(title);
    WatchInk.Sidebar.updateEpisodeCard(title, 'Now Playing');
    WatchInk.Chat.addSystemMessage(`🎬 Now watching: ${title}`);
  }
}

/* ================================================================
   SPA / URL NAVIGATION DETECTION
   ================================================================ */
function watchUrl() {
  /* Patch history API for pushState/replaceState */
  const patchHistory = method => {
    const orig = history[method];
    history[method] = function (...args) {
      const result = orig.apply(this, args);
      onUrlChange();
      return result;
    };
  };
  patchHistory('pushState');
  patchHistory('replaceState');

  /* Listen for browser nav */
  window.addEventListener('popstate', onUrlChange);

  /* MutationObserver as final fallback */
  _urlObserver = new MutationObserver(() => {
    if (location.href !== _currentUrl) onUrlChange();
  });
  _urlObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function onUrlChange() {
  if (location.href === _currentUrl) return;
  _currentUrl = location.href;
  console.log('[WatchInk] URL changed →', _currentUrl);

  /* Reset video reference so we re-detect */
  WatchInk.state.videoEl = null;

  /* Re-detect after short delay for DOM to settle */
  setTimeout(() => {
    detectVideo();
    detectEpisodeMeta();
  }, 1200);
}

/* ================================================================
   RESIZE
   ================================================================ */
function onResize() {
  WatchInk.Controls.positionOverlay();
}

/* ================================================================
   TOAST UTILITY  (global helper used across all components)
   ================================================================ */
WatchInk.toast = function (message, type = 'success', duration = 3000) {
  const container = document.getElementById('wi-toasts');
  if (!container) return;

  const ICON = {
    success: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm3.3 5.3l-4 4a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06L7 8.69l3.47-3.47a.75.75 0 1 1 1.06 1.07z"/></svg>`,
    warn:    `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L1 14h14L8 1zm0 3l5 9H3l5-9zm-.75 3v3h1.5V7h-1.5zm0 4v1.5h1.5V11h-1.5z"/></svg>`,
    error:   `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75h1.5v5h-1.5v-5zm0 6.25h1.5v1.5h-1.5V11z"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `wi-toast wi-toast-${type}`;
  toast.innerHTML = `
    <div class="wi-toast-icon">${ICON[type] || ICON.success}</div>
    <span>${escHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('wi-toast-exit');
    setTimeout(() => toast.remove(), 220);
  }, duration);
};

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ================================================================
   MESSAGE LISTENER (from popup.js or background)
   ================================================================ */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'showPanel') {
    WatchInk.Sidebar?.open();
    sendResponse({ ok: true });
  }
  return true;
});

/* ================================================================
   WAIT FOR BODY → BOOT
   ================================================================ */
function waitForBody() {
  if (document.body) {
    boot();
  } else {
    new MutationObserver((_, obs) => {
      if (document.body) {
        obs.disconnect();
        boot();
      }
    }).observe(document.documentElement, { childList: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForBody);
} else {
  waitForBody();
}

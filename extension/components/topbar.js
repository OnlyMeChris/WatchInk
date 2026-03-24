/* ================================================================
   components/topbar.js — WatchInk Top Navigation Bar
   ================================================================ */

'use strict';

window.WatchInk = window.WatchInk || {};

WatchInk.TopBar = (() => {

  /* ── SVG Icons ─────────────────────────────────────────────── */
  const ICONS = {
    logo: `<svg viewBox="0 0 16 16"><path d="M8 1L2 5v6l6 4 6-4V5L8 1z" fill-opacity="0.9"/><path d="M8 1L2 5l6 4 6-4L8 1z" fill="white" fill-opacity="0.3"/></svg>`,
    room: `<svg viewBox="0 0 16 16"><path d="M8 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3 14a5 5 0 0 1 10 0H3z"/></svg>`,
    leave: `<svg viewBox="0 0 16 16"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    menu: `<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="1.5" rx="0.75" fill="currentColor"/><rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/><rect x="2" y="10.5" width="8" height="1.5" rx="0.75" fill="currentColor"/></svg>`,
  };

  /* ── Render ─────────────────────────────────────────────────── */
  function render() {
    const el = document.createElement('div');
    el.id = 'wi-topbar';
    el.innerHTML = `
      <div id="wi-tb-left">
        <a id="wi-logo" href="#" onclick="return false;">
          <div id="wi-logo-mark">${ICONS.logo}</div>
          <span id="wi-logo-text">Watch<em>Ink</em></span>
        </a>

        <div id="wi-divider"></div>

        <div id="wi-room-chip">
          <div id="wi-room-avatar">${ICONS.room}</div>
          <span id="wi-room-label">Room</span>
          <span id="wi-room-name" data-wi="room-name">General</span>
        </div>
      </div>

      <div id="wi-tb-center">
        <div id="wi-episode-pill">
          <div id="wi-episode-dot"></div>
          <span id="wi-episode-name" data-wi="episode-name">No content detected</span>
        </div>
      </div>

      <div id="wi-tb-right">
        <div id="wi-sync-indicator" class="wi-synced">
          <div id="wi-sync-dot"></div>
          <span id="wi-sync-text">Synced</span>
        </div>
        <button id="wi-leave-btn" class="wi-tb-btn wi-tb-btn-danger">
          ${ICONS.leave}
          Leave
        </button>
        <button id="wi-toggle-sidebar-btn" class="wi-tb-btn wi-tb-btn-secondary" title="Toggle panel">
          ${ICONS.menu}
          Panel
        </button>
      </div>
    `;
    return el;
  }

  /* ── Mount ──────────────────────────────────────────────────── */
  function mount() {
    if (document.getElementById('wi-topbar')) return;
    const bar = render();
    document.body.prepend(bar);
    bindEvents();
  }

  /* ── Events ─────────────────────────────────────────────────── */
  function bindEvents() {
    const leaveBtn = document.getElementById('wi-leave-btn');
    const toggleBtn = document.getElementById('wi-toggle-sidebar-btn');

    leaveBtn?.addEventListener('click', () => {
      WatchInk.toast('Left the room', 'success');
      WatchInk.state.roomId = null;
      WatchInk.state.roomName = 'General';
      updateRoom('General');
      WatchInk.Sidebar?.close();
    });

    toggleBtn?.addEventListener('click', () => {
      WatchInk.Sidebar?.toggle();
    });
  }

  /* ── Public API ─────────────────────────────────────────────── */
  function updateSync(synced) {
    const indicator = document.getElementById('wi-sync-indicator');
    const text = document.getElementById('wi-sync-text');
    if (!indicator) return;
    indicator.className = synced ? 'wi-synced' : 'wi-desynced';
    if (text) text.textContent = synced ? 'Synced' : 'Desynced';
  }

  function updateEpisode(name) {
    const el = document.getElementById('wi-episode-name');
    if (el) el.textContent = name || 'No content detected';
  }

  function updateRoom(name) {
    const el = document.getElementById('wi-room-name');
    if (el) el.textContent = name || 'General';
  }

  function unmount() {
    document.getElementById('wi-topbar')?.remove();
  }

  return { mount, unmount, updateSync, updateEpisode, updateRoom };

})();

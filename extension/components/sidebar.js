/* ================================================================
   components/sidebar.js — WatchInk Right Sidebar
   Manages tab navigation, participants panel, host controls
   ================================================================ */

'use strict';

window.WatchInk = window.WatchInk || {};

WatchInk.Sidebar = (() => {

  let _visible = true;
  let _activeTab = 'chat';

  /* ── Icons ──────────────────────────────────────────────────── */
  const ICONS = {
    chat: `<svg viewBox="0 0 16 16"><path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5l-3 2V3a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
    users: `<svg viewBox="0 0 16 16"><path d="M5.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1 14a4.5 4.5 0 0 1 9 0H1z" fill="currentColor"/><path d="M11 6a2 2 0 1 0 0-4M15 14a4 4 0 0 0-4-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    controls: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill="currentColor"/></svg>`,
    play: `<svg viewBox="0 0 16 16"><path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor"/></svg>`,
    pause: `<svg viewBox="0 0 16 16"><rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor"/><rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor"/></svg>`,
    seekBack: `<svg viewBox="0 0 16 16"><path d="M4 8a5 5 0 1 0 1.5-3.5M4 4v4h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><text x="4.5" y="11" font-size="5.5" fill="currentColor" font-family="sans-serif">10</text></svg>`,
    seekFwd: `<svg viewBox="0 0 16 16"><path d="M12 8a5 5 0 1 1-1.5-3.5M12 4v4H8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><text x="4.5" y="11" font-size="5.5" fill="currentColor" font-family="sans-serif">10</text></svg>`,
    next: `<svg viewBox="0 0 16 16"><path d="M3 3l7 5-7 5V3z" fill="currentColor"/><rect x="12" y="3" width="2" height="10" rx="1" fill="currentColor"/></svg>`,
    sync: `<svg viewBox="0 0 16 16"><path d="M2 8a6 6 0 0 1 6-6 6 6 0 0 1 4.24 1.76M14 8a6 6 0 0 1-6 6 6 6 0 0 1-4.24-1.76" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10.5 3.5L12.5 2l.5 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 12.5L3.5 14l-.5-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };

  /* ── Avatar colors ──────────────────────────────────────────── */
  const AVATAR_COLORS = [
    ['#e0f2fe','#0369a1'], ['#fce7f3','#be185d'], ['#f0fdf4','#15803d'],
    ['#fef3c7','#92400e'], ['#ede9fe','#6d28d9'], ['#fee2e2','#991b1b'],
    ['#ecfdf5','#047857'], ['#fff7ed','#c2410c'],
  ];

  function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  /* ── Render ─────────────────────────────────────────────────── */
  function render() {
    const el = document.createElement('div');
    el.id = 'wi-sidebar';

    el.innerHTML = `
      <!-- Tab Navigation -->
      <div id="wi-sidebar-tabs" role="tablist">
        <button class="wi-tab wi-tab-active" data-tab="chat" role="tab">
          ${ICONS.chat} Chat
          <span id="wi-chat-badge" class="wi-tab-badge wi-hidden">0</span>
        </button>
        <button class="wi-tab" data-tab="participants" role="tab">
          ${ICONS.users} People
        </button>
        <button class="wi-tab" data-tab="controls" role="tab">
          ${ICONS.controls} Controls
        </button>
      </div>

      <!-- Chat Panel (rendered by WatchInk.Chat) -->
      <div class="wi-panel wi-panel-active" id="wi-panel-chat" role="tabpanel">
        <!-- Chat will be mounted here -->
      </div>

      <!-- Participants Panel -->
      <div class="wi-panel" id="wi-panel-participants" role="tabpanel">
        <div class="wi-section-header">In the room</div>
        <div id="wi-participants-panel"></div>
      </div>

      <!-- Host Controls Panel -->
      <div class="wi-panel" id="wi-panel-controls" role="tabpanel">
        <div class="wi-section-header">Host Controls</div>
        <div id="wi-controls-panel">

          <!-- Episode card -->
          <div id="wi-episode-card">
            <div id="wi-ep-card-title">No episode detected</div>
            <div id="wi-ep-card-meta">Open a title on Disney+</div>
          </div>

          <!-- Playback controls -->
          <div class="wi-ctrl-section">
            <div class="wi-ctrl-label">Playback</div>
            <div class="wi-ctrl-row">
              <button class="wi-ctrl-btn" id="wi-ctrl-play" title="Play / Pause">
                ${ICONS.play}
                <span>Play</span>
              </button>
              <button class="wi-ctrl-btn" id="wi-ctrl-pause" title="Pause">
                ${ICONS.pause}
                <span>Pause</span>
              </button>
            </div>
          </div>

          <!-- Seek -->
          <div class="wi-ctrl-section">
            <div class="wi-ctrl-label">Seek</div>
            <div class="wi-ctrl-row">
              <button class="wi-ctrl-btn" id="wi-ctrl-back10" title="Rewind 10s">
                ${ICONS.seekBack}
                <span>−10s</span>
              </button>
              <button class="wi-ctrl-btn" id="wi-ctrl-fwd10" title="Forward 10s">
                ${ICONS.seekFwd}
                <span>+10s</span>
              </button>
              <button class="wi-ctrl-btn" id="wi-ctrl-next" title="Next episode">
                ${ICONS.next}
                <span>Next</span>
              </button>
            </div>
          </div>

          <!-- Sync all -->
          <div class="wi-ctrl-section">
            <div class="wi-ctrl-label">Sync</div>
            <button id="wi-sync-all-btn">
              ${ICONS.sync} Sync All Viewers
            </button>
          </div>

          <!-- Room code display -->
          <div class="wi-ctrl-section">
            <div class="wi-ctrl-label">Room Code</div>
            <div id="wi-episode-card" style="flex-direction:row;align-items:center;gap:10px;">
              <span id="wi-room-code-display" style="font-size:18px;font-weight:700;letter-spacing:3px;color:var(--wi-primary-dark);flex:1;">——</span>
              <button id="wi-copy-code-btn" class="wi-ctrl-btn" style="flex:0 0 auto;flex-direction:row;gap:4px;padding:6px 12px;">
                <svg viewBox="0 0 16 16" width="13" height="13"><rect x="5" y="5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
                Copy
              </button>
            </div>
          </div>

        </div>
      </div>
    `;
    return el;
  }

  /* ── Mount ──────────────────────────────────────────────────── */
  function mount() {
    if (document.getElementById('wi-sidebar')) return;
    const el = render();
    document.body.appendChild(el);
    bindEvents();
    renderParticipants();
  }

  /* ── Tab Switching ──────────────────────────────────────────── */
  function switchTab(tabName) {
    _activeTab = tabName;

    document.querySelectorAll('.wi-tab').forEach(btn => {
      btn.classList.toggle('wi-tab-active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.wi-panel').forEach(panel => {
      panel.classList.toggle('wi-panel-active', panel.id === `wi-panel-${tabName}`);
    });

    if (tabName === 'chat') clearUnread();
  }

  /* ── Events ─────────────────────────────────────────────────── */
  function bindEvents() {
    // Tab clicks
    document.querySelectorAll('.wi-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Playback controls
    document.getElementById('wi-ctrl-play')?.addEventListener('click', () => {
      WatchInk.Controls?.play();
    });
    document.getElementById('wi-ctrl-pause')?.addEventListener('click', () => {
      WatchInk.Controls?.pause();
    });
    document.getElementById('wi-ctrl-back10')?.addEventListener('click', () => {
      WatchInk.Controls?.seek(-10);
    });
    document.getElementById('wi-ctrl-fwd10')?.addEventListener('click', () => {
      WatchInk.Controls?.seek(10);
    });
    document.getElementById('wi-ctrl-next')?.addEventListener('click', () => {
      WatchInk.Controls?.nextEpisode();
    });
    document.getElementById('wi-sync-all-btn')?.addEventListener('click', () => {
      WatchInk.Controls?.syncAll();
      WatchInk.toast('Syncing all viewers…', 'success');
    });
    document.getElementById('wi-copy-code-btn')?.addEventListener('click', () => {
      const code = document.getElementById('wi-room-code-display')?.textContent;
      if (code && code !== '——') {
        navigator.clipboard.writeText(code).then(() => WatchInk.toast('Room code copied!', 'success'));
      }
    });
  }

  /* ── Participants ───────────────────────────────────────────── */
  function renderParticipants() {
    const container = document.getElementById('wi-participants-panel');
    if (!container) return;

    const participants = WatchInk.state?.participants || [];

    if (participants.length === 0) {
      container.innerHTML = `
        <div style="padding:24px 16px;text-align:center;">
          <div style="font-size:28px;margin-bottom:8px;">👥</div>
          <div style="font-size:13px;color:var(--wi-text-3);line-height:1.5;">
            No one else here yet.<br>Share the room code to invite friends.
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    participants.forEach(p => {
      const [bg, fg] = avatarColor(p.name);
      const chip = document.createElement('div');
      chip.className = 'wi-participant';
      chip.innerHTML = `
        <div class="wi-participant-avatar" style="background:${bg};color:${fg};">
          ${initials(p.name)}
        </div>
        <div class="wi-participant-info">
          <div class="wi-participant-name">${escHtml(p.name)}</div>
          <div class="wi-participant-status">${p.status || 'Watching'}</div>
        </div>
        ${p.isHost ? '<span class="wi-badge wi-badge-host">Host</span>' : ''}
        ${p.isYou  ? '<span class="wi-badge wi-badge-you">You</span>'  : ''}
      `;
      container.appendChild(chip);
    });
  }

  function addParticipant(p) {
    WatchInk.state.participants.push(p);
    renderParticipants();
  }

  function removeParticipant(name) {
    WatchInk.state.participants = WatchInk.state.participants.filter(p => p.name !== name);
    renderParticipants();
  }

  /* ── Episode card ───────────────────────────────────────────── */
  function updateEpisodeCard(title, meta) {
    const t = document.getElementById('wi-ep-card-title');
    const m = document.getElementById('wi-ep-card-meta');
    if (t) t.textContent = title || 'No episode detected';
    if (m) m.textContent = meta || 'Open a title on Disney+';
  }

  function updateRoomCode(code) {
    const el = document.getElementById('wi-room-code-display');
    if (el) el.textContent = code || '——';
  }

  /* ── Unread badge ───────────────────────────────────────────── */
  let _unread = 0;

  function addUnread() {
    if (_activeTab === 'chat') return;
    _unread++;
    const badge = document.getElementById('wi-chat-badge');
    const floatBadge = document.getElementById('wi-float-badge');
    if (badge) { badge.textContent = _unread; badge.classList.remove('wi-hidden'); }
    if (floatBadge) { floatBadge.textContent = _unread; floatBadge.classList.add('wi-badge-visible'); }
  }

  function clearUnread() {
    _unread = 0;
    const badge = document.getElementById('wi-chat-badge');
    const floatBadge = document.getElementById('wi-float-badge');
    if (badge) { badge.textContent = '0'; badge.classList.add('wi-hidden'); }
    if (floatBadge) { floatBadge.textContent = '0'; floatBadge.classList.remove('wi-badge-visible'); }
  }

  /* ── Visibility ─────────────────────────────────────────────── */
  function open() {
    _visible = true;
    const el = document.getElementById('wi-sidebar');
    el?.classList.remove('wi-sidebar-hidden');
    document.body.classList.add('wi-sidebar-open');
  }

  function close() {
    _visible = false;
    const el = document.getElementById('wi-sidebar');
    el?.classList.add('wi-sidebar-hidden');
    document.body.classList.remove('wi-sidebar-open');
  }

  function toggle() {
    _visible ? close() : open();
  }

  function unmount() {
    document.getElementById('wi-sidebar')?.remove();
    document.body.classList.remove('wi-sidebar-open');
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  return {
    mount, unmount, open, close, toggle, switchTab,
    addParticipant, removeParticipant, renderParticipants,
    updateEpisodeCard, updateRoomCode, addUnread, clearUnread,
  };

})();

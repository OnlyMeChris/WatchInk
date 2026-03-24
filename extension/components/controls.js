/* ================================================================
   components/controls.js — WatchInk Video Overlay & Playback
   Injects overlay over the Disney+ video element
   ================================================================ */

'use strict';

window.WatchInk = window.WatchInk || {};

WatchInk.Controls = (() => {

  let _overlayEl      = null;
  let _syncLabelEl    = null;
  let _hideTimer      = null;
  let _overlayBound   = false;

  const ICONS = {
    play:  `<svg viewBox="0 0 24 24"><path d="M5 3l14 9L5 21V3z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24"><rect x="5" y="3" width="5" height="18" rx="1.5"/><rect x="14" y="3" width="5" height="18" rx="1.5"/></svg>`,
  };

  /* ── Mount Overlay ──────────────────────────────────────────── */
  function mount() {
    if (document.getElementById('wi-video-overlay')) return;

    /* Center play/pause button */
    const overlay = document.createElement('div');
    overlay.id = 'wi-video-overlay';
    overlay.innerHTML = `
      <button id="wi-play-btn" title="Play / Pause">
        ${ICONS.play}
      </button>
    `;
    document.body.appendChild(overlay);
    _overlayEl = overlay;

    /* Synced-with-host label */
    const syncLabel = document.createElement('div');
    syncLabel.id = 'wi-sync-label-overlay';
    syncLabel.innerHTML = `
      <div id="wi-sync-label-dot"></div>
      <span>Synced with host</span>
    `;
    document.body.appendChild(syncLabel);
    _syncLabelEl = syncLabel;

    /* Float toggle button */
    const toggle = document.createElement('button');
    toggle.id = 'wi-float-toggle';
    toggle.title = 'Open WatchInk Panel';
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>
      <span id="wi-float-badge"></span>
    `;
    document.body.appendChild(toggle);

    /* Float toggle → open sidebar + switch to chat */
    toggle.addEventListener('click', () => {
      WatchInk.Sidebar?.open();
      WatchInk.Sidebar?.switchTab('chat');
    });

    /* Play btn click */
    document.getElementById('wi-play-btn')?.addEventListener('click', togglePlay);

    /* Toast container */
    const toasts = document.createElement('div');
    toasts.id = 'wi-toasts';
    document.body.appendChild(toasts);

    positionOverlay();
    bindVideoHover();
  }

  /* ── Position overlay over video ───────────────────────────── */
  function positionOverlay() {
    const video = WatchInk.state?.videoEl;
    if (!video || !_overlayEl) return;

    const rect = video.getBoundingClientRect();
    if (!rect.width) return;

    const style = _overlayEl.style;
    style.top    = rect.top    + 'px';
    style.left   = rect.left   + 'px';
    style.width  = rect.width  + 'px';
    style.height = rect.height + 'px';

    /* Position sync label at bottom-center of video */
    if (_syncLabelEl) {
      _syncLabelEl.style.top  = (rect.bottom - 56) + 'px';
      _syncLabelEl.style.left = (rect.left + rect.width / 2 - 80) + 'px';
    }
  }

  /* ── Show/hide center button on video hover ─────────────────── */
  function bindVideoHover() {
    if (_overlayBound) return;
    _overlayBound = true;

    const showBtn = () => {
      const btn = document.getElementById('wi-play-btn');
      if (btn) {
        btn.classList.add('wi-btn-visible');
        updatePlayIcon();
      }
      clearTimeout(_hideTimer);
      _hideTimer = setTimeout(hideBtn, 2200);
    };

    const hideBtn = () => {
      document.getElementById('wi-play-btn')?.classList.remove('wi-btn-visible');
    };

    document.addEventListener('mousemove', e => {
      if (!_overlayEl) return;
      const rect = _overlayEl.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top  && e.clientY <= rect.bottom;
      if (inside) showBtn();
    });

    /* Track video play/pause to update icon */
    const video = WatchInk.state?.videoEl;
    if (video) {
      video.addEventListener('play',  updatePlayIcon);
      video.addEventListener('pause', updatePlayIcon);
    }
  }

  /* ── Update play/pause icon ─────────────────────────────────── */
  function updatePlayIcon() {
    const btn  = document.getElementById('wi-play-btn');
    const video = WatchInk.state?.videoEl;
    if (!btn || !video) return;

    const isPlaying = !video.paused && !video.ended;
    btn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    btn.classList.toggle('wi-paused', !isPlaying);
  }

  /* ── Playback API ───────────────────────────────────────────── */
  function togglePlay() {
    const video = WatchInk.state?.videoEl;
    if (!video) return;
    video.paused ? video.play() : video.pause();
    updatePlayIcon();
  }

  function play() {
    const video = WatchInk.state?.videoEl;
    if (video?.paused) { video.play(); updatePlayIcon(); }
  }

  function pause() {
    const video = WatchInk.state?.videoEl;
    if (video && !video.paused) { video.pause(); updatePlayIcon(); }
  }

  function seek(deltaSeconds) {
    const video = WatchInk.state?.videoEl;
    if (!video) return;
    const t = Math.max(0, video.currentTime + deltaSeconds);
    video.currentTime = t;
    WatchInk.toast(
      (deltaSeconds > 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`),
      'success'
    );
  }

  function nextEpisode() {
    /* Try clicking Disney+'s native "next episode" button */
    const nextBtn = document.querySelector(
      '[data-testid="next-button"], [class*="next-episode"], [aria-label*="next" i]'
    );
    if (nextBtn) {
      nextBtn.click();
      WatchInk.toast('Skipping to next episode…', 'success');
    } else {
      WatchInk.toast('Next episode button not found', 'warn');
    }
  }

  function syncAll() {
    const video = WatchInk.state?.videoEl;
    if (!video) return;
    /* In a real implementation: broadcast current time to all viewers via socket */
    showSyncLabel();
  }

  /* ── Sync label ─────────────────────────────────────────────── */
  function showSyncLabel(duration = 2500) {
    if (!_syncLabelEl) return;
    _syncLabelEl.classList.add('wi-sync-visible');
    setTimeout(() => {
      _syncLabelEl?.classList.remove('wi-sync-visible');
    }, duration);
  }

  function hideSyncLabel() {
    _syncLabelEl?.classList.remove('wi-sync-visible');
  }

  /* ── Resize & reposition ────────────────────────────────────── */
  function onResize() {
    positionOverlay();
  }

  function unmount() {
    _overlayEl?.remove();
    _syncLabelEl?.remove();
    document.getElementById('wi-float-toggle')?.remove();
    document.getElementById('wi-toasts')?.remove();
    _overlayEl = null;
    _syncLabelEl = null;
    _overlayBound = false;
    clearTimeout(_hideTimer);
  }

  return {
    mount, unmount, onResize,
    play, pause, seek, togglePlay, nextEpisode, syncAll,
    showSyncLabel, hideSyncLabel, positionOverlay, updatePlayIcon,
  };

})();

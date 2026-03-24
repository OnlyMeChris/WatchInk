/* ================================================================
   components/chat.js — WatchInk Chat System
   Manages message rendering and input
   ================================================================ */

'use strict';

window.WatchInk = window.WatchInk || {};

WatchInk.Chat = (() => {

  const ICONS = {
    send: `<svg viewBox="0 0 16 16"><path d="M2 8l12-6-5 6 5 6L2 8z" fill="currentColor"/><path d="M14 2L9 8" fill="none" stroke="white" stroke-width="1.2"/></svg>`,
  };

  /* ── Render ─────────────────────────────────────────────────── */
  function render() {
    const panel = document.getElementById('wi-panel-chat');
    if (!panel || panel.querySelector('#wi-chat-panel')) return;

    panel.innerHTML = `
      <div id="wi-chat-panel">
        <div id="wi-chat-messages" role="log" aria-live="polite" aria-label="Chat messages">
          <!-- System welcome message -->
          <div class="wi-msg-system">Joined WatchInk room — say hi! 👋</div>
        </div>
        <div id="wi-chat-input-wrap">
          <textarea
            id="wi-chat-input"
            placeholder="Type a message…"
            maxlength="500"
            rows="1"
            aria-label="Chat input"
          ></textarea>
          <button id="wi-chat-send" aria-label="Send message" title="Send">
            ${ICONS.send}
          </button>
        </div>
      </div>
    `;

    bindInputEvents();
  }

  /* ── Input Handling ─────────────────────────────────────────── */
  function bindInputEvents() {
    const input = document.getElementById('wi-chat-input');
    const sendBtn = document.getElementById('wi-chat-send');
    if (!input || !sendBtn) return;

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
    });

    // Send on Enter (Shift+Enter = newline)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);
  }

  /* ── Send Message ───────────────────────────────────────────── */
  function sendMessage() {
    const input = document.getElementById('wi-chat-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const msg = {
      id: Date.now(),
      author: WatchInk.state?.username || 'You',
      body: text,
      time: now(),
      isSelf: true,
    };

    addMessage(msg);
    WatchInk.state?.messages?.push(msg);

    input.value = '';
    input.style.height = 'auto';
    input.focus();
  }

  /* ── Add Message ────────────────────────────────────────────── */
  function addMessage(msg) {
    const container = document.getElementById('wi-chat-messages');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'wi-msg';

    const authorClass = msg.isSelf
      ? 'wi-msg-self'
      : msg.isHost ? 'wi-msg-host-author' : '';

    el.innerHTML = `
      <div class="wi-msg-header">
        <span class="wi-msg-author ${authorClass}">${escHtml(msg.author)}</span>
        <span class="wi-msg-time">${msg.time}</span>
      </div>
      <div class="wi-msg-body">${escHtml(msg.body)}</div>
    `;

    container.appendChild(el);
    scrollToBottom();

    // Notify sidebar if not focused on chat
    if (!msg.isSelf) WatchInk.Sidebar?.addUnread();
  }

  /* ── System Messages ────────────────────────────────────────── */
  function addSystemMessage(text) {
    const container = document.getElementById('wi-chat-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'wi-msg-system';
    el.textContent = text;
    container.appendChild(el);
    scrollToBottom();
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  function scrollToBottom() {
    const el = document.getElementById('wi-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function mount() {
    render();
  }

  function unmount() {
    // Panel is removed with sidebar
  }

  return { mount, unmount, addMessage, addSystemMessage };

})();

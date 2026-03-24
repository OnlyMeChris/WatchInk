/**
 * WatchInk Sync Server — v4.1
 * ===========================
 * Host-controlled playback + URL sync + drift correction
 *
 * Fixes & improvements over v4.0:
 *  - Input sanitisation on all events
 *  - Chat rate limiting (5 msg / 3 s per user)
 *  - Duplicate socket join guard (same socket re-emitting room:join)
 *  - sync:request naming conflict resolved (host replies directly)
 *  - url:heartbeat now also syncs guests who just joined
 *  - /health endpoint (uptime, memory)
 *  - Graceful shutdown
 *  - Enhanced logging
 */

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['polling', 'websocket'],
  pingInterval: 10000,
  pingTimeout:  5000,
});

// ── In-memory store ─────────────────────────────────────────
/**
 * rooms[roomId] = {
 *   hostId:           string (socket.id)
 *   hostUrl:          string
 *   platform:         string
 *   currentTimestamp: number
 *   users: [{ id, username, isHost }]
 * }
 */
const rooms = {};

// Chat rate-limit: socketId → { count, resetAt }
const chatBuckets = {};

// ── Utility ─────────────────────────────────────────────────
function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

function safeRoomId(str)    { return sanitize(str, 12).toUpperCase().replace(/[^A-Z0-9]/g,''); }
function safeUsername(str)  { return sanitize(str, 28).replace(/[<>"']/g, ''); }
function safeMessage(str)   { return sanitize(str, 300); }
function safeUrl(str)       { return sanitize(str, 2000); }

function getRoom(roomId) { return rooms[roomId] || null; }

function broadcastUsers(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  io.to(roomId).emit('room:users', { users: room.users });
}

// ── Rate limit check for chat ────────────────────────────────
function checkChatRate(socketId) {
  const now = Date.now();
  const bucket = chatBuckets[socketId] || { count: 0, resetAt: now + 3000 };
  if (now > bucket.resetAt) {
    bucket.count   = 0;
    bucket.resetAt = now + 3000;
  }
  bucket.count++;
  chatBuckets[socketId] = bucket;
  return bucket.count <= 5; // max 5 per 3s window
}

// ── REST ─────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) =>
  res.json({
    status: 'ok',
    service: 'WatchInk Sync Server v4.1',
    rooms: Object.keys(rooms).length,
    users: Object.values(rooms).reduce((a, r) => a + r.users.length, 0),
  })
);

app.get('/health', (_req, res) =>
  res.json({
    uptime:  process.uptime(),
    memory:  process.memoryUsage(),
    rooms:   Object.keys(rooms).length,
    users:   Object.values(rooms).reduce((a, r) => a + r.users.length, 0),
  })
);

app.get('/rooms', (_req, res) =>
  res.json(
    Object.entries(rooms).map(([id, r]) => ({
      id,
      platform:         r.platform,
      currentTimestamp: r.currentTimestamp,
      userCount:        r.users.length,
      users: r.users.map(u => ({ username: u.username, isHost: u.isHost })),
    }))
  )
);

// ── Socket.IO ────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id} connected  (total: ${io.sockets.sockets.size})`);

  // ── Create Room ──────────────────────────────────────────
  socket.on('room:create', ({ roomId, username, platform, url }) => {
    const rid  = safeRoomId(roomId);
    const user = safeUsername(username);
    if (!rid || !user) return socket.emit('room:error', 'Invalid room ID or username.');
    if (getRoom(rid))  return socket.emit('room:error', 'Room already exists. Join instead.');

    rooms[rid] = {
      hostId:           socket.id,
      hostUrl:          safeUrl(url || ''),
      platform:         sanitize(platform || 'Disney+', 40),
      currentTimestamp: 0,
      users:            [{ id: socket.id, username: user, isHost: true }],
    };

    socket.join(rid);
    socket.data.roomId   = rid;
    socket.data.username = user;

    socket.emit('room:joined', {
      roomId:  rid,
      isHost:  true,
      users:   rooms[rid].users,
    });

    console.log(`[Room] Created  ${rid}  by ${user}`);
  });

  // ── Join Room ────────────────────────────────────────────
  socket.on('room:join', ({ roomId, username }) => {
    const rid  = safeRoomId(roomId);
    const user = safeUsername(username);
    if (!rid || !user) return socket.emit('room:error', 'Invalid room or username.');

    const room = getRoom(rid);
    if (!room) return socket.emit('room:error', 'Room not found. Check the code and try again.');

    // Prevent double-join in same session
    if (socket.data.roomId === rid) return;

    // Deduplicate username
    let name   = user;
    const taken = room.users.map(u => u.username.toLowerCase());
    if (taken.includes(name.toLowerCase())) {
      name = `${name}${Math.floor(Math.random() * 99) + 1}`;
    }

    room.users.push({ id: socket.id, username: name, isHost: false });
    socket.join(rid);
    socket.data.roomId   = rid;
    socket.data.username = name;

    socket.emit('room:joined', {
      roomId:  rid,
      isHost:  false,
      users:   room.users,
    });

    socket.to(rid).emit('room:userJoined', { username: name, users: room.users });

    // Send current URL to new joiner
    if (room.hostUrl) socket.emit('url:navigate', { url: room.hostUrl });

    // Ask host for current timestamp
    const hostSocket = io.sockets.sockets.get(room.hostId);
    if (hostSocket) {
      hostSocket.emit('sync:requestState', { for: socket.id, roomId: rid });
    } else {
      // Host not found — send last known timestamp
      socket.emit('sync:seek', { currentTime: room.currentTimestamp });
    }

    console.log(`[Room] ${name} joined ${rid}  (${room.users.length} users)`);
  });

  // ── Leave Room ───────────────────────────────────────────
  socket.on('room:leave', ({ roomId }) => {
    handleLeave(socket, safeRoomId(roomId));
  });

  // ── Host-only helper ─────────────────────────────────────
  const hostOnly = (roomId, cb) => {
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    cb(room);
  };

  // ── Playback Events (Host → Guests) ──────────────────────
  socket.on('sync:play', ({ roomId, currentTime }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, room => {
      const t = Number(currentTime) || 0;
      room.currentTimestamp = t;
      socket.to(rid).emit('sync:play', { currentTime: t });
    });
  });

  socket.on('sync:pause', ({ roomId, currentTime }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, room => {
      const t = Number(currentTime) || 0;
      room.currentTimestamp = t;
      socket.to(rid).emit('sync:pause', { currentTime: t });
    });
  });

  socket.on('sync:seek', ({ roomId, currentTime }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, room => {
      const t = Number(currentTime) || 0;
      room.currentTimestamp = t;
      socket.to(rid).emit('sync:seek', { currentTime: t });
    });
  });

  socket.on('sync:timeUpdate', ({ roomId, currentTime }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, room => {
      const t = Number(currentTime) || 0;
      room.currentTimestamp = t;
      socket.to(rid).emit('sync:timeUpdate', { currentTime: t });
    });
  });

  socket.on('sync:rate', ({ roomId, rate }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, () => {
      socket.to(rid).emit('sync:rate', { rate: Number(rate) || 1 });
    });
  });

  // Host replies to a state request for a specific joiner
  socket.on('sync:stateReply', ({ roomId, forSocketId, currentTime, paused }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, room => {
      const t = Number(currentTime) || 0;
      room.currentTimestamp = t;
      const target = io.sockets.sockets.get(forSocketId);
      if (!target) return;
      target.emit(paused ? 'sync:pause' : 'sync:play', { currentTime: t });
    });
  });

  // ── URL events ───────────────────────────────────────────
  socket.on('url:changed', ({ roomId, url }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, room => {
      room.hostUrl = safeUrl(url);
      socket.to(rid).emit('url:changed', { url: room.hostUrl });
    });
  });

  socket.on('url:heartbeat', ({ roomId, url }) => {
    const rid = safeRoomId(roomId);
    hostOnly(rid, room => {
      const clean = safeUrl(url);
      if (clean && clean !== room.hostUrl) {
        room.hostUrl = clean;
        socket.to(rid).emit('url:changed', { url: clean });
      }
    });
  });

  // ── Chat ─────────────────────────────────────────────────
  socket.on('chat:message', ({ roomId, username, message }) => {
    const rid = safeRoomId(roomId);
    const room = getRoom(rid);
    if (!room) return;

    const msg  = safeMessage(message);
    const user = safeUsername(username);
    if (!msg || !user) return;

    if (!checkChatRate(socket.id)) {
      socket.emit('chat:rateLimit', { message: 'Slow down — too many messages!' });
      return;
    }

    // Broadcast to everyone in room EXCEPT sender
    // (sender renders optimistically on client)
    socket.to(rid).emit('chat:message', { username: user, message: msg });
  });

  // ── Disconnect ───────────────────────────────────────────
  socket.on('disconnect', reason => {
    const rid = socket.data.roomId;
    if (rid) handleLeave(socket, rid);
    delete chatBuckets[socket.id];
    console.log(`[-] ${socket.id} disconnected (${reason})`);
  });
});

// ── Handle user leaving ──────────────────────────────────────
function handleLeave(socket, roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  const leaving = room.users.find(u => u.id === socket.id);
  room.users    = room.users.filter(u => u.id !== socket.id);

  socket.leave(roomId);
  socket.data.roomId   = null;
  socket.data.username = null;

  if (room.users.length === 0) {
    delete rooms[roomId];
    console.log(`[Room] Deleted  ${roomId}  (empty)`);
    return;
  }

  const leavingName = leaving?.username || 'Someone';

  // Host transfer
  if (room.hostId === socket.id) {
    const newHost = room.users[0];
    newHost.isHost  = true;
    room.hostId     = newHost.id;

    io.to(roomId).emit('room:hostChanged', {
      newHostId:       newHost.id,
      newHostUsername: newHost.username,
      users:           room.users,
    });

    console.log(`[Room] Host transferred in ${roomId} → ${newHost.username}`);
  }

  io.to(roomId).emit('room:userLeft', {
    username: leavingName,
    users:    room.users,
  });

  console.log(`[Room] ${leavingName} left ${roomId}  (${room.users.length} remaining)`);
}

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 WatchInk Sync Server v4.1  →  http://0.0.0.0:${PORT}`);
});

// ── Graceful shutdown ────────────────────────────────────────
['SIGTERM', 'SIGINT'].forEach(sig => {
  process.on(sig, () => {
    console.log(`\n[Server] Shutting down (${sig})…`);
    io.close(() => {
      server.close(() => process.exit(0));
    });
  });
});

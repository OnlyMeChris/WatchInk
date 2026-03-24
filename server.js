/**
 * WatchInk Sync Server — v4.0
 * ===========================
 * Full host-controlled playback and URL sync
 * Features:
 *   - Host-only playback enforcement
 *   - Auto URL sync for new joiners
 *   - Drift correction support
 *   - Auto-host transfer if host leaves
 *   - Reconnect support via localStorage token
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
});

const rooms = {};

// ── Health Check ─────────────────────────────
app.use(cors());
app.get("/", (req, res) =>
  res.json({
    status: "ok",
    message: "WatchInk Sync Server v4.0",
    rooms: Object.keys(rooms).length,
    users: Object.values(rooms).reduce((a, r) => a + r.users.length, 0),
  }),
);

// List rooms
app.get("/rooms", (req, res) =>
  res.json(
    Object.entries(rooms).map(([id, r]) => ({
      id,
      platform: r.platform,
      hostUrl: r.hostUrl,
      currentTimestamp: r.currentTimestamp,
      users: r.users.map((u) => ({ username: u.username, isHost: u.isHost })),
    })),
  ),
);

// ── Socket Events ───────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // ------------------- Create Room -------------------
  socket.on("room:create", ({ roomId, username, platform, url }) => {
    if (!roomId || !username) return;
    if (rooms[roomId]) return socket.emit("room:error", "Room exists");

    rooms[roomId] = {
      hostId: socket.id,
      hostUrl: url || "",
      platform: platform || "Unknown",
      currentTimestamp: 0,
      users: [{ id: socket.id, username, isHost: true }],
    };

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    socket.emit("room:joined", {
      roomId,
      isHost: true,
      users: rooms[roomId].users,
    });

    console.log(`[Room] Created ${roomId} by ${username} | URL: ${url}`);
  });

  // ------------------- Join Room -------------------
  socket.on("room:join", ({ roomId, username }) => {
    if (!roomId || !username) return;
    const room = rooms[roomId];
    if (!room) return socket.emit("room:error", "Room not found");

    // Deduplicate usernames
    let name = username;
    const taken = room.users.map((u) => u.username);
    if (taken.includes(name))
      name = `${name}${Math.floor(Math.random() * 99) + 1}`;

    room.users.push({ id: socket.id, username: name, isHost: false });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = name;

    socket.emit("room:joined", { roomId, isHost: false, users: room.users });
    socket
      .to(roomId)
      .emit("room:userJoined", { username: name, users: room.users });

    // Send host URL and current time to new joiner
    if (room.hostUrl) socket.emit("url:navigate", { url: room.hostUrl });

    const hostSocket = io.sockets.sockets.get(room.hostId);
    if (hostSocket)
      hostSocket.emit("sync:request", { from: socket.id, roomId });

    console.log(`[Room] ${name} joined ${roomId}`);
  });

  // ------------------- Leave Room -------------------
  socket.on("room:leave", ({ roomId }) => handleLeave(socket, roomId));

  // ------------------- Playback Events (Host Only) -------------------
  const hostOnly = (roomId, callback) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return false;
    callback(room);
    return true;
  };

  socket.on("sync:play", ({ roomId, currentTime }) => {
    hostOnly(roomId, (room) => {
      room.currentTimestamp = currentTime;
      socket.to(roomId).emit("sync:play", { currentTime });
    });
  });

  socket.on("sync:pause", ({ roomId, currentTime }) => {
    hostOnly(roomId, (room) => {
      room.currentTimestamp = currentTime;
      socket.to(roomId).emit("sync:pause", { currentTime });
    });
  });

  socket.on("sync:seek", ({ roomId, currentTime }) => {
    hostOnly(roomId, (room) => {
      room.currentTimestamp = currentTime;
      socket.to(roomId).emit("sync:seek", { currentTime });
    });
  });

  socket.on("sync:rate", ({ roomId, rate }) => {
    hostOnly(roomId, (room) => {
      socket.to(roomId).emit("sync:rate", { rate });
    });
  });

  socket.on("sync:timeUpdate", ({ roomId, currentTime }) => {
    hostOnly(roomId, (room) => {
      room.currentTimestamp = currentTime;
      socket.to(roomId).emit("sync:timeUpdate", { currentTime });
    });
  });

  // ------------------- URL Events -------------------
  socket.on("url:changed", ({ roomId, url }) => {
    hostOnly(roomId, (room) => {
      room.hostUrl = url;
      socket.to(roomId).emit("url:changed", { url });
    });
  });

  socket.on("url:heartbeat", ({ roomId, url }) => {
    hostOnly(roomId, (room) => {
      if (url && url !== room.hostUrl) room.hostUrl = url;
    });
  });

  // ------------------- Sync Request -------------------
  socket.on("sync:request", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const hostSocket = io.sockets.sockets.get(room.hostId);
    if (hostSocket)
      hostSocket.emit("sync:request", { from: socket.id, roomId });
  });

  // ------------------- Chat -------------------
  socket.on("chat:message", ({ roomId, username, message }) => {
    const room = rooms[roomId];
    if (!room || !message?.trim()) return;
    io.to(roomId).emit("chat:message", {
      username,
      message: message.substring(0, 300),
    });
  });

  // ------------------- Disconnect -------------------
  socket.on("disconnect", () => {
    const rid = socket.data.roomId;
    if (rid) handleLeave(socket, rid);
  });
});

// ── Handle User Leaving ─────────────────────────────
function handleLeave(socket, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const leaving = room.users.find((u) => u.id === socket.id);
  room.users = room.users.filter((u) => u.id !== socket.id);
  socket.leave(roomId);
  socket.data.roomId = null;

  if (room.users.length === 0) {
    delete rooms[roomId];
    return;
  }

  const name = leaving?.username || "Someone";

  // Transfer host if host leaves
  if (room.hostId === socket.id) {
    const newHost = room.users[0];
    newHost.isHost = true;
    room.hostId = newHost.id;
    io.to(roomId).emit("room:hostChanged", {
      newHostId: newHost.id,
      newHostUsername: newHost.username,
      users: room.users,
    });
  }

  io.to(roomId).emit("room:userLeft", { username: name, users: room.users });
}

// ── Start Server ─────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎬 WatchInk Sync Server v4.0 running on port ${PORT}`);
});

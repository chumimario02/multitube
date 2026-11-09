"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;

const MAX_MEMBERS = 30;
const MAX_QUEUE = 100;
const MAX_CHAT = 80;
const MAX_ROOMS = 500;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const rooms = new Map();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 20000,
  pingTimeout: 20000,
});

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

const roomKey = (code) => `room:${code}`;

function generateCode() {
  let code = "";
  do {
    code = "";
    for (const byte of crypto.randomBytes(5)) {
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  } while (rooms.has(code));
  return code;
}

function clampTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 60 * 60 * 24);
}

function sanitizeVideo(video) {
  if (!video || typeof video !== "object") return null;
  const videoId = String(video.videoId || "").trim();
  if (!VIDEO_ID_RE.test(videoId)) return null;
  return {
    id: crypto.randomUUID(),
    videoId,
    title: clean(video.title, 140) || "Video de YouTube",
    author: clean(video.author, 80) || "",
    thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  };
}

function serializeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    createdAt: room.createdAt,
    current: room.current,
    playing: room.playing,
    time: room.time,
    updatedAt: room.updatedAt,
    queue: room.queue,
    members: [...room.members.entries()].map(([id, member]) => ({
      id,
      name: member.name,
      isHost: id === room.hostId,
    })),
  };
}

function getRoom(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function hostRoom(socket) {
  const room = getRoom(socket);
  if (!room || room.hostId !== socket.id) return null;
  return room;
}

function broadcastState(room) {
  io.to(roomKey(room.code)).emit("room:state", serializeRoom(room));
}

function emitSync(room, reason) {
  io.to(roomKey(room.code)).emit("player:sync", {
    videoId: room.current ? room.current.videoId : null,
    itemId: room.current ? room.current.id : null,
    playing: room.playing,
    time: room.time,
    at: Date.now(),
    reason,
  });
}

function pushMessage(room, message) {
  room.chat.push(message);
  if (room.chat.length > MAX_CHAT) room.chat.shift();
  io.to(roomKey(room.code)).emit("chat:message", message);
}

function systemMessage(room, text) {
  pushMessage(room, {
    id: crypto.randomUUID(),
    type: "system",
    text,
    at: Date.now(),
  });
}

function joinSocketToRoom(socket, room) {
  socket.join(roomKey(room.code));
  socket.data.roomCode = room.code;
}

function createRoom(socket, name) {
  const room = {
    code: generateCode(),
    hostId: socket.id,
    members: new Map([[socket.id, { name, joinedAt: Date.now() }]]),
    queue: [],
    current: null,
    playing: false,
    time: 0,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chat: [],
  };
  rooms.set(room.code, room);
  joinSocketToRoom(socket, room);
  systemMessage(room, `✨ ${name} creó la sala`);
  return room;
}

function joinRoom(socket, code, name) {
  const room = rooms.get(code);
  if (!room) return { error: "Sala no encontrada. Revisa el código." };
  if (room.members.size >= MAX_MEMBERS) {
    return { error: `La sala está llena (${MAX_MEMBERS} personas).` };
  }
  room.members.set(socket.id, { name, joinedAt: Date.now() });
  joinSocketToRoom(socket, room);
  systemMessage(room, `👋 ${name} se unió`);
  return { room };
}

function advance(room) {
  if (room.queue.length > 0) {
    room.current = room.queue.shift();
    room.playing = true;
    room.time = 0;
    room.updatedAt = Date.now();
    emitSync(room, "load");
  } else {
    room.current = null;
    room.playing = false;
    room.time = 0;
    room.updatedAt = Date.now();
    emitSync(room, "stop");
  }
  broadcastState(room);
}

function leaveRoom(socket, announce = true) {
  const room = getRoom(socket);
  if (!room) {
    socket.data.roomCode = null;
    return;
  }

  const member = room.members.get(socket.id);
  const name = member ? member.name : "Alguien";
  room.members.delete(socket.id);
  socket.leave(roomKey(room.code));
  socket.data.roomCode = null;

  if (room.members.size === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === socket.id) {
    const next = [...room.members.entries()].sort(
      (a, b) => a[1].joinedAt - b[1].joinedAt
    )[0];
    if (next) {
      room.hostId = next[0];
      systemMessage(room, `👑 ${next[1].name} es el nuevo host`);
      io.to(roomKey(room.code)).emit("host:changed", {
        hostId: room.hostId,
        hostName: next[1].name,
      });
    }
  }

  if (announce) systemMessage(room, `${name} salió de la sala`);
  broadcastState(room);
}

function parseArgs(payload, ack) {
  if (typeof payload === "function") return [{}, payload];
  return [payload || {}, typeof ack === "function" ? ack : () => {}];
}

/* ------------------------------------------------------------------ */
/* Socket.IO                                                          */
/* ------------------------------------------------------------------ */

io.on("connection", (socket) => {
  socket.data.roomCode = null;
  socket.data.lastChat = 0;

  socket.on("room:create", (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const name = clean(data.name, 24);
    if (!name) return respond({ ok: false, error: "Escribe tu nombre." });
    if (rooms.size >= MAX_ROOMS) {
      return respond({ ok: false, error: "Servidor lleno. Intenta más tarde." });
    }

    leaveRoom(socket, false);
    const room = createRoom(socket, name);
    respond({
      ok: true,
      youId: socket.id,
      code: room.code,
      state: serializeRoom(room),
      messages: [],
    });
    broadcastState(room);
  });

  socket.on("room:join", (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const name = clean(data.name, 24);
    const code = String(data.code || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

    if (!name) return respond({ ok: false, error: "Escribe tu nombre." });
    if (code.length < 4) {
      return respond({ ok: false, error: "Código de sala inválido." });
    }

    leaveRoom(socket, false);
    const result = joinRoom(socket, code, name);
    if (result.error) return respond({ ok: false, error: result.error });

    const room = result.room;
    respond({
      ok: true,
      youId: socket.id,
      code: room.code,
      state: serializeRoom(room),
      messages: room.chat.slice(-50),
    });
    broadcastState(room);
  });

  socket.on("room:leave", () => leaveRoom(socket, true));

  socket.on("queue:add", (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const room = hostRoom(socket);
    if (!room) {
      return respond({ ok: false, error: "Solo el host puede agregar videos." });
    }
    if (room.queue.length >= MAX_QUEUE) {
      return respond({ ok: false, error: "La cola está llena (100 videos)." });
    }

    const item = sanitizeVideo(data.video);
    if (!item) return respond({ ok: false, error: "Video inválido." });

    if (!room.current) {
      room.current = item;
      room.playing = true;
      room.time = 0;
      room.updatedAt = Date.now();
      emitSync(room, "load");
    } else {
      room.queue.push(item);
    }

    respond({ ok: true, item });
    broadcastState(room);
  });

  socket.on("queue:remove", (payload) => {
    const room = hostRoom(socket);
    if (!room) return;
    const id = String(payload?.id || "");
    const index = room.queue.findIndex((item) => item.id === id);
    if (index === -1) return;
    room.queue.splice(index, 1);
    broadcastState(room);
  });

  socket.on("player:playItem", (payload) => {
    const room = hostRoom(socket);
    if (!room) return;
    const id = String(payload?.id || "");
    const index = room.queue.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [item] = room.queue.splice(index, 1);
    room.current = item;
    room.playing = true;
    room.time = 0;
    room.updatedAt = Date.now();
    emitSync(room, "load");
    broadcastState(room);
  });

  socket.on("player:play", (payload) => {
    const room = hostRoom(socket);
    if (!room || !room.current) return;
    room.playing = true;
    room.time = clampTime(payload?.time ?? room.time);
    room.updatedAt = Date.now();
    emitSync(room, "play");
  });

  socket.on("player:pause", (payload) => {
    const room = hostRoom(socket);
    if (!room || !room.current) return;
    room.playing = false;
    room.time = clampTime(payload?.time ?? room.time);
    room.updatedAt = Date.now();
    emitSync(room, "pause");
  });

  socket.on("player:seek", (payload) => {
    const room = hostRoom(socket);
    if (!room || !room.current) return;
    room.time = clampTime(payload?.time);
    room.updatedAt = Date.now();
    emitSync(room, "seek");
  });

  socket.on("player:heartbeat", (payload) => {
    const room = hostRoom(socket);
    if (!room || !room.current) return;
    room.time = clampTime(payload?.time);
    room.updatedAt = Date.now();
    emitSync(room, "tick");
  });

  socket.on("player:next", () => {
    const room = hostRoom(socket);
    if (!room) return;
    advance(room);
  });

  socket.on("chat:send", (payload) => {
    const room = getRoom(socket);
    if (!room) return;
    const text = clean(payload?.text, 300);
    if (!text) return;

    const now = Date.now();
    if (now - socket.data.lastChat < 350) return;
    socket.data.lastChat = now;

    const name = room.members.get(socket.id)?.name || "Anónimo";
    pushMessage(room, {
      id: crypto.randomUUID(),
      type: "user",
      fromId: socket.id,
      name,
      text,
      at: now,
    });
  });

  socket.on("disconnect", () => leaveRoom(socket, true));
});

/* ------------------------------------------------------------------ */
/* Limpieza de salas                                                  */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.members.size === 0) {
      rooms.delete(code);
      continue;
    }
    if (now - room.createdAt > ROOM_TTL_MS) {
      io.to(roomKey(code)).emit("room:closed", {
        reason: "La sala expiró por inactividad.",
      });
      io.in(roomKey(code)).socketsLeave(roomKey(code));
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* Arranque                                                           */
/* ------------------------------------------------------------------ */

server.listen(PORT, () => {
  console.log("");
  console.log("  MULTITUBE listo 🎬");
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log("  LAN:     http://TU-IP-LOCAL:" + PORT);
  console.log("");
});

function shutdown() {
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

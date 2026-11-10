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
    suggestions: room.suggestions,
    hasKey: Boolean(room.apiKey),
    shareKey: room.shareKey,
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
    suggestions: [],
    current: null,
    playing: false,
    time: 0,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    chat: [],
    apiKey: null,
    shareKey: true,
    searchCache: new Map(),
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
    // Privacidad: la key del host no se hereda al siguiente host.
    room.apiKey = null;
    room.shareKey = false;
    room.searchCache.clear();

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
/* YouTube search (server-side, la key nunca sale al cliente)         */
/* ------------------------------------------------------------------ */

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isoDurationToSeconds(iso) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ""));
  if (!match) return 0;
  return (
    (Number(match[1]) || 0) * 3600 +
    (Number(match[2]) || 0) * 60 +
    (Number(match[3]) || 0)
  );
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatViews(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const compact = (num, suffix) => {
    const text = num.toFixed(1).replace(".", ",").replace(",0", "");
    return `${text} ${suffix} de vistas`;
  };
  if (n >= 1e9) return compact(n / 1e9, "mil M");
  if (n >= 1e6) return compact(n / 1e6, "M");
  if (n >= 1e3) return compact(n / 1e3, "mil");
  return `${n} vistas`;
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const units = [
    [31536000000, "año", "años"],
    [2592000000, "mes", "meses"],
    [604800000, "semana", "semanas"],
    [86400000, "día", "días"],
    [3600000, "hora", "horas"],
    [60000, "minuto", "minutos"],
  ];
  for (const [ms, one, many] of units) {
    const value = Math.floor(diff / ms);
    if (value >= 1) return `hace ${value} ${value === 1 ? one : many}`;
  }
  return "hace un momento";
}

async function searchYouTube(apiKey, query, pageToken) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "50",
    videoEmbeddable: "true",
    q: query,
    key: apiKey,
  });
  if (pageToken) params.set("pageToken", pageToken);

  let response;
  try {
    response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );
  } catch {
    throw new Error("No se pudo conectar con YouTube.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason || "";
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new Error("La cuota diaria de la API key se agotó. Prueba mañana o usa otra key.");
    }
    if (reason === "keyInvalid" || reason === "badRequest") {
      throw new Error("La API key no es válida. Revísala en Google Cloud.");
    }
    if (reason === "ipRefererBlocked" || reason === "forbidden") {
      throw new Error("La API key tiene restricciones que bloquean esta búsqueda.");
    }
    throw new Error(data?.error?.message || "YouTube rechazó la búsqueda.");
  }

  const items = (data.items || [])
    .map((item) => ({
      videoId: item.id?.videoId,
      title: decodeEntities(item.snippet?.title || "Video de YouTube"),
      author: decodeEntities(item.snippet?.channelTitle || ""),
      thumb:
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${item.id?.videoId}/mqdefault.jpg`,
      publishedAt: item.snippet?.publishedAt || "",
    }))
    .filter((item) => item.videoId);

  const ids = items.map((item) => item.videoId);
  if (ids.length) {
    try {
      const detailParams = new URLSearchParams({
        part: "contentDetails,statistics",
        id: ids.join(","),
        key: apiKey,
      });
      const detailResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${detailParams.toString()}`
      );
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        const byId = new Map(
          (detailData.items || []).map((video) => [video.id, video])
        );
        for (const item of items) {
          const detail = byId.get(item.videoId);
          if (!detail) continue;
          item.duration = formatDuration(
            isoDurationToSeconds(detail.contentDetails?.duration)
          );
          item.views = formatViews(detail.statistics?.viewCount);
        }
      }
    } catch {
      /* los detalles son opcionales */
    }
  }

  for (const item of items) {
    item.ago = timeAgo(item.publishedAt);
  }

  return { items, nextPageToken: data.nextPageToken || null };
}

async function fetchRecommendations(apiKey, region, pageToken) {
  const params = new URLSearchParams({
    part: "snippet,contentDetails,statistics",
    chart: "mostPopular",
    maxResults: "50",
    regionCode: region,
    key: apiKey,
  });
  if (pageToken) params.set("pageToken", pageToken);

  let response;
  try {
    response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  } catch {
    throw new Error("No se pudo conectar con YouTube.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason || "";
    // Si el código de región no es soportado, reintenta con US.
    if (region !== "US" && (reason === "badRequest" || reason === "invalidParameter")) {
      return fetchRecommendations(apiKey, "US", pageToken);
    }
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new Error("La cuota diaria de la API key se agotó.");
    }
    if (reason === "keyInvalid" || reason === "badRequest") {
      throw new Error("La API key no es válida.");
    }
    throw new Error(data?.error?.message || "YouTube rechazó la solicitud.");
  }

  const items = (data.items || [])
    .map((video) => ({
      videoId: video.id,
      title: decodeEntities(video.snippet?.title || "Video de YouTube"),
      author: decodeEntities(video.snippet?.channelTitle || ""),
      thumb:
        video.snippet?.thumbnails?.medium?.url ||
        video.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`,
      publishedAt: video.snippet?.publishedAt || "",
      duration: formatDuration(isoDurationToSeconds(video.contentDetails?.duration)),
      views: formatViews(video.statistics?.viewCount),
    }))
    .filter((video) => video.videoId);

  for (const item of items) {
    item.ago = timeAgo(item.publishedAt);
  }

  return { items, nextPageToken: data.nextPageToken || null };
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

  /* ----------------------------------------------------------------
     API key compartida (se guarda en memoria, nunca se envía al cliente)
     ---------------------------------------------------------------- */
  socket.on("key:set", (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const room = hostRoom(socket);
    if (!room) {
      return respond({ ok: false, error: "Solo el host puede configurar la API key." });
    }

    const key = String(data.key || "").trim();
    if (key && !/^[A-Za-z0-9_-]{20,200}$/.test(key)) {
      return respond({ ok: false, error: "Esa no parece una API key válida." });
    }

    room.apiKey = key || null;
    room.shareKey = Boolean(data.share);
    room.searchCache.clear();
    broadcastState(room);
    respond({ ok: true, hasKey: Boolean(room.apiKey), shareKey: room.shareKey });
  });

  socket.on("search:query", async (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const room = getRoom(socket);
    if (!room) return respond({ ok: false, error: "No estás en una sala." });
    if (!room.apiKey) {
      return respond({ ok: false, error: "El host aún no configuró su API key." });
    }
    if (room.hostId !== socket.id && !room.shareKey) {
      return respond({ ok: false, error: "El host no comparte su API key con los invitados." });
    }

    const query = clean(data.q, 120);
    const pageToken = String(data.pageToken || "").trim() || null;
    if (!query) return respond({ ok: false, error: "Escribe algo para buscar." });

    const now = Date.now();
    if (!pageToken && now - (socket.data.lastSearch || 0) < 1200) {
      return respond({ ok: false, error: "Espera un momento antes de buscar de nuevo." });
    }
    if (!pageToken) socket.data.lastSearch = now;

    const cacheKey = query.toLowerCase();
    if (!pageToken) {
      const cached = room.searchCache.get(cacheKey);
      if (cached && now - cached.at < 10 * 60 * 1000) {
        return respond({
          ok: true,
          items: cached.items,
          nextPageToken: cached.nextPageToken,
          cached: true,
        });
      }
    }

    try {
      const result = await searchYouTube(room.apiKey, query, pageToken);
      if (!pageToken) {
        room.searchCache.set(cacheKey, {
          at: now,
          items: result.items,
          nextPageToken: result.nextPageToken,
        });
        if (room.searchCache.size > 20) {
          room.searchCache.delete(room.searchCache.keys().next().value);
        }
      }
      respond({ ok: true, items: result.items, nextPageToken: result.nextPageToken });
    } catch (error) {
      respond({ ok: false, error: error.message || "No se pudo buscar en YouTube." });
    }
  });

  /* ----------------------------------------------------------------
     Recomendaciones (videos en tendencia)
     ---------------------------------------------------------------- */
  socket.on("recommendations:get", async (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const room = getRoom(socket);
    if (!room) return respond({ ok: false, error: "No estás en una sala." });
    if (!room.apiKey) {
      return respond({ ok: false, error: "El host aún no configuró su API key." });
    }
    if (room.hostId !== socket.id && !room.shareKey) {
      return respond({ ok: false, error: "El host no comparte su API key con los invitados." });
    }

    const now = Date.now();
    if (now - (socket.data.lastSearch || 0) < 1200) {
      return respond({ ok: false, error: "Espera un momento antes de buscar de nuevo." });
    }
    socket.data.lastSearch = now;

    const rawRegion = String(data.region || "US")
      .toUpperCase()
      .slice(0, 2);
    // Solo códigos ISO de 2 letras. En móviles el locale puede ser 'es-419'
    // (slice -> '19'), que YouTube rechaza. En ese caso usamos 'US'.
    const region = /^[A-Z]{2}$/.test(rawRegion) ? rawRegion : "US";
    const pageToken = String(data.pageToken || "").trim() || null;

    const cacheKey = `__rec__${region}`;
    if (!pageToken) {
      const cached = room.searchCache.get(cacheKey);
      if (cached && now - cached.at < 10 * 60 * 1000) {
        return respond({ ok: true, items: cached.items, nextPageToken: cached.nextPageToken });
      }
    }

    try {
      const result = await fetchRecommendations(room.apiKey, region, pageToken);
      if (!pageToken) {
        room.searchCache.set(cacheKey, { at: now, items: result.items, nextPageToken: result.nextPageToken });
        if (room.searchCache.size > 20) {
          room.searchCache.delete(room.searchCache.keys().next().value);
        }
      }
      respond({ ok: true, items: result.items, nextPageToken: result.nextPageToken });
    } catch (error) {
      respond({ ok: false, error: error.message || "No se pudieron cargar recomendaciones." });
    }
  });

  /* ----------------------------------------------------------------
     Sugerencias de invitados
     ---------------------------------------------------------------- */
  socket.on("suggest:add", (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const room = getRoom(socket);
    if (!room) return respond({ ok: false, error: "No estás en una sala." });
    if (room.suggestions.length >= 30) {
      return respond({ ok: false, error: "Hay demasiadas sugerencias pendientes." });
    }

    const item = sanitizeVideo(data.video);
    if (!item) return respond({ ok: false, error: "Video inválido." });

    const duplicate =
      room.current?.videoId === item.videoId ||
      room.queue.some((video) => video.videoId === item.videoId) ||
      room.suggestions.some((video) => video.videoId === item.videoId);
    if (duplicate) {
      return respond({ ok: false, error: "Ese video ya está en la sala." });
    }

    const member = room.members.get(socket.id);
    const suggestion = {
      ...item,
      fromId: socket.id,
      fromName: member?.name || "Anónimo",
      at: Date.now(),
    };

    room.suggestions.push(suggestion);
    respond({ ok: true, suggestion });
    broadcastState(room);
  });

  socket.on("suggest:accept", (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const room = hostRoom(socket);
    if (!room) {
      return respond({ ok: false, error: "Solo el host puede aceptar sugerencias." });
    }

    const id = String(data.id || "");
    const index = room.suggestions.findIndex((item) => item.id === id);
    if (index === -1) {
      return respond({ ok: false, error: "Esa sugerencia ya no existe." });
    }

    const [suggestion] = room.suggestions.splice(index, 1);
    const item = {
      id: suggestion.id,
      videoId: suggestion.videoId,
      title: suggestion.title,
      author: suggestion.author,
      thumb: suggestion.thumb,
    };

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
    io.to(roomKey(room.code)).emit("suggest:resolved", {
      id,
      status: "accepted",
      title: item.title,
      by: room.members.get(socket.id)?.name || "El host",
    });
  });

  socket.on("suggest:reject", (payload, ack) => {
    const [data, respond] = parseArgs(payload, ack);
    const room = hostRoom(socket);
    if (!room) {
      return respond({ ok: false, error: "Solo el host puede rechazar sugerencias." });
    }

    const id = String(data.id || "");
    const index = room.suggestions.findIndex((item) => item.id === id);
    if (index === -1) {
      return respond({ ok: false, error: "Esa sugerencia ya no existe." });
    }

    const [suggestion] = room.suggestions.splice(index, 1);
    respond({ ok: true });
    broadcastState(room);
    io.to(roomKey(room.code)).emit("suggest:resolved", {
      id,
      status: "rejected",
      title: suggestion.title,
      by: room.members.get(socket.id)?.name || "El host",
    });
  });

  socket.on("suggest:remove", (payload) => {
    const room = getRoom(socket);
    if (!room) return;
    const id = String(payload?.id || "");
    const index = room.suggestions.findIndex((item) => item.id === id);
    if (index === -1) return;
    const suggestion = room.suggestions[index];
    if (room.hostId !== socket.id && suggestion.fromId !== socket.id) return;
    room.suggestions.splice(index, 1);
    broadcastState(room);
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

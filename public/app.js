"use strict";

/* ============================================================
   MULTITUBE — cliente
   ============================================================ */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const socket = io();

  const els = {
    nav: $("#nav"),
    conn: $("#conn-status"),
    connText: $("#conn-text"),
    viewHome: $("#view-home"),
    viewRoom: $("#view-room"),
    btnCreate: $("#btn-create"),
    btnJoin: $("#btn-join"),
    modal: $("#modal"),
    modalClose: $("#modal-close"),
    panelCreate: $("#panel-create"),
    panelJoin: $("#panel-join"),
    createName: $("#create-name"),
    createSubmit: $("#create-submit"),
    joinName: $("#join-name"),
    joinCode: $("#join-code"),
    joinSubmit: $("#join-submit"),
    roomCode: $("#room-code"),
    btnCopy: $("#btn-copy"),
    btnLeave: $("#btn-leave"),
    members: $("#members"),
    memberCount: $("#member-count"),
    playerWrap: $("#player-wrap"),
    playerCover: $("#player-cover"),
    coverText: $("#cover-text"),
    playerGate: $("#player-gate"),
    playerShield: $("#player-shield"),
    soundPill: $("#sound-pill"),
    btnPlay: $("#btn-play"),
    btnNext: $("#btn-next"),
    btnVol: $("#btn-vol"),
    btnFs: $("#btn-fs"),
    timeCurrent: $("#time-current"),
    timeTotal: $("#time-total"),
    seek: $("#seek"),
    nowPlaying: $("#now-playing"),
    hostHint: $("#host-hint"),
    hostTools: $("#host-tools"),
    apiKey: $("#api-key"),
    btnSaveKey: $("#btn-save-key"),
    shareKey: $("#share-key"),
    btnOpenSearch: $("#btn-open-search"),
    guestNote: $("#guest-note"),
    urlInput: $("#url-input"),
    btnAddUrl: $("#btn-add-url"),
    queueList: $("#queue-list"),
    queueCount: $("#queue-count"),
    queueEmpty: $("#queue-empty"),
    tabQueue: $("#tab-queue"),
    tabSuggest: $("#tab-suggest"),
    tabChat: $("#tab-chat"),
    suggestList: $("#suggest-list"),
    suggestCount: $("#suggest-count"),
    suggestEmpty: $("#suggest-empty"),
    voiceStatus: $("#voice-status"),
    voiceControls: $("#voice-controls"),
    voiceEnable: $("#voice-enable"),
    voicePerm: $("#voice-perm"),
    voicePermIcon: $("#voice-perm-icon"),
    voicePermTitle: $("#voice-perm-title"),
    voicePermText: $("#voice-perm-text"),
    voicePermYes: $("#voice-perm-yes"),
    voicePermNo: $("#voice-perm-no"),
    voiceActive: $("#voice-active"),
    voiceMic: $("#voice-mic"),
    voiceCam: $("#voice-cam"),
    voiceHangup: $("#voice-hangup"),
    voiceCount: $("#voice-count"),
    voiceFloaters: $("#voice-floaters"),
    chatMessages: $("#chat-messages"),
    chatForm: $("#chat-form"),
    chatInput: $("#chat-input"),
    immersive: $("#immersive"),
    ytClose: $("#yt-close"),
    ytClose2: $("#yt-close-2"),
    ytSearchForm: $("#yt-search-form"),
    ytSearchInput: $("#yt-search-input"),
    ytMode: $("#yt-mode"),
    ytMain: $("#yt-main"),
    ytChips: $("#yt-chips"),
    ytStatus: $("#yt-status"),
    ytGrid: $("#yt-grid"),
    ytLoadMore: $("#yt-load-more"),
    ytRetry: $("#yt-retry"),
    ytEmpty: $("#yt-empty"),
    ytGate: $("#yt-gate"),
    ytGateTitle: $("#yt-gate-title"),
    ytGateText: $("#yt-gate-text"),
    ytGateRow: $("#yt-gate-row"),
    ytGateInput: $("#yt-gate-input"),
    ytGateSave: $("#yt-gate-save"),
    ytGateBack: $("#yt-gate-back"),
    toast: $("#toast"),
  };

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>',
    volumeOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    volumeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="m16 9 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const state = {
    youId: null,
    room: null,
    isHost: false,
    player: null,
    playerReady: false,
    ytReady: false,
    pendingSync: null,
    pauseAfterLoad: null,
    lastSync: null,
    clock: { time: 0, at: Date.now(), playing: false },
    seeking: false,
    apiKey: localStorage.getItem("multitube:key") || "",
    shareKey: localStorage.getItem("multitube:share") !== "0",
    voiceAsked: sessionStorage.getItem("multitube:voiceAsked") === "1",
    voiceActive: false,
    localAudioStream: null,
    localVideoStream: null,
    voicePeers: new Map(),
    voiceFloaters: new Map(),
    floaterIndex: 0,
    ytNextToken: null,
    ytLoadingMore: false,
    ytQuery: "",
    session: readSession(),
    rendered: new Set(),
  };

  /* ------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------ */

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem("multitube:session") || "null");
    } catch {
      return null;
    }
  }

  function saveSession() {
    if (state.session) {
      sessionStorage.setItem("multitube:session", JSON.stringify(state.session));
    }
  }

  function clearSession() {
    state.session = null;
    sessionStorage.removeItem("multitube:session");
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  function fmt(sec) {
    let value = Number(sec);
    if (!Number.isFinite(value) || value < 0) value = 0;
    const s = Math.floor(value % 60);
    const m = Math.floor((value / 60) % 60);
    const h = Math.floor(value / 3600);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }

  function fmtTime(timestamp) {
    try {
      return new Date(timestamp).toLocaleTimeString("es", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function safe(fn, fallback) {
    try {
      const value = fn();
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
  }

  function hueFor(name) {
    let hue = 0;
    for (const char of String(name)) {
      hue = (hue * 31 + char.codePointAt(0)) % 360;
    }
    return hue;
  }

  function decodeHtml(text) {
    const area = document.createElement("textarea");
    area.innerHTML = String(text || "");
    return area.value;
  }

  function parseYouTubeId(input) {
    const raw = String(input || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    const patterns = [
      /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function emitAck(event, data, timeout = 9000) {
    return new Promise((resolve) => {
      socket.timeout(timeout).emit(event, data, (err, response) => {
        if (err) {
          resolve({ ok: false, error: "Sin respuesta del servidor. Revisa tu conexión." });
          return;
        }
        resolve(
          response && typeof response === "object"
            ? response
            : { ok: false, error: "Respuesta inválida del servidor." }
        );
      });
    });
  }

  async function fetchOEmbed(videoId) {
    try {
      const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${target}&format=json`
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------
     Conexión
     ------------------------------------------------------------ */

  function setConnected(connected) {
    els.conn.classList.toggle("online", connected);
    els.connText.textContent = connected ? "En línea" : "Reconectando…";
  }

  function bindSocket() {
    socket.on("connect", () => {
      setConnected(true);
      if (state.session && (!state.room || state.youId !== socket.id)) {
        emitAck("room:join", state.session).then((response) => {
          if (response.ok) {
            onJoined(response, state.session.name, { silent: true });
          } else {
            clearSession();
            if (state.room) goHome();
          }
        });
      }
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("room:state", (room) => {
      if (!state.room) return;
      applyRoomState(room);
    });

    socket.on("player:sync", handleSync);

    socket.on("chat:message", renderMessage);

    socket.on("host:changed", ({ hostId, hostName } = {}) => {
      if (hostId === state.youId) {
        toast("👑 Ahora eres el host");
        if (state.apiKey) {
          emitAck("key:set", { key: state.apiKey, share: state.shareKey });
        }
      } else {
        toast(`👑 ${hostName || "Alguien"} ahora es el host`);
      }
    });

    socket.on("suggest:resolved", ({ status, title, by } = {}) => {
      if (!title) return;
      if (status === "accepted") {
        toast(`✅ ${by || "El host"} aceptó: ${title}`);
      } else if (status === "rejected") {
        toast(`❌ ${by || "El host"} rechazó: ${title}`);
      }
    });

    // Chat de voz / video (señalización WebRTC)
    socket.on("voice:peer-joined", ({ fromId, name } = {}) => {
      if (!fromId || fromId === state.youId) return;
      if (!state.voicePeerNames) state.voicePeerNames = new Map();
      state.voicePeerNames.set(fromId, name || "Participante");
      createFloater(fromId, name || "Participante", null);
      updateVoiceCount();
      toast(`🎤 ${name || "Alguien"} se unió al chat de voz`);
    });

    socket.on("voice:peer-left", ({ fromId } = {}) => {
      if (!fromId) return;
      removeVoicePeer(fromId);
      updateVoiceCount();
    });

    socket.on("voice:offer", async ({ from, sdp } = {}) => {
      if (!from || !sdp) return;
      if (!state.voiceActive && !state.localAudioStream && !state.localVideoStream) return;
      const pc = createPeerConnection(from, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("voice:answer", { to: from, sdp: pc.localDescription });
      } catch (error) {
        console.error("voice offer error", error);
      }
    });

    socket.on("voice:answer", async ({ from, sdp } = {}) => {
      if (!from || !sdp) return;
      const peer = state.voicePeers.get(from);
      if (!peer) return;
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (error) {
        console.error("voice answer error", error);
      }
    });

    socket.on("voice:ice", async ({ from, candidate } = {}) => {
      if (!from || !candidate) return;
      const peer = state.voicePeers.get(from);
      if (!peer) return;
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        // ICE candidates can arrive before remote desc; ignore
      }
    });

    socket.on("room:closed", ({ reason } = {}) => {
      toast(reason || "La sala se cerró");
      clearSession();
      goHome();
    });
  }

  /* ------------------------------------------------------------
     Entrar / salir de la sala
     ------------------------------------------------------------ */

  async function createRoom() {
    const name = els.createName.value.trim();
    if (!name) return toast("Escribe tu nombre para crear la sala");

    els.createSubmit.disabled = true;
    const response = await emitAck("room:create", { name });
    els.createSubmit.disabled = false;

    if (!response.ok) return toast(response.error || "No se pudo crear la sala");
    onJoined(response, name);
  }

  async function joinRoom() {
    const name = els.joinName.value.trim();
    const code = els.joinCode.value.trim().toUpperCase();
    if (!name) return toast("Escribe tu nombre");
    if (code.length < 4) return toast("Escribe el código de la sala");

    els.joinSubmit.disabled = true;
    const response = await emitAck("room:join", { name, code });
    els.joinSubmit.disabled = false;

    if (!response.ok) return toast(response.error || "No se pudo entrar a la sala");
    onJoined(response, name);
  }

  function onJoined(response, name, { silent = false } = {}) {
    state.youId = response.youId;
    state.room = response.state;
    state.isHost = response.state.hostId === response.youId;
    state.session = { code: response.state.code, name };
    saveSession();

    state.rendered.clear();
    els.chatMessages.innerHTML = "";

    enterRoom();
    applyRoomState(response.state);
    (response.messages || []).forEach(renderMessage);
    closeModal();

    if (state.isHost && state.apiKey) {
      emitAck("key:set", { key: state.apiKey, share: state.shareKey });
    }
    if (!state.isHost && state.playerReady) state.player.mute();
    updateSoundPill();
    updateKeyUI();

    if (!state.voiceAsked || localStorage.getItem("multitube:voicePref") === "yes") {
      setTimeout(() => askVoiceAndCamera(), 700);
    }

    if (!silent) {
      toast(
        state.isHost
          ? `🎬 Sala ${response.state.code} creada`
          : `🎉 Te uniste a la sala ${response.state.code}`
      );
    }
  }

  function enterRoom() {
    els.viewHome.classList.add("hidden");
    els.viewRoom.classList.remove("hidden");
    document.body.classList.add("in-room");
    ensurePlayer();
    updateHostUI();
  }

  function leaveRoom() {
    if (!window.confirm("¿Seguro que quieres salir de la sala?")) return;
    hangupVoice();
    socket.emit("room:leave");
    clearSession();
    goHome();
  }

  function goHome() {
    state.room = null;
    state.youId = null;
    state.isHost = false;
    state.lastSync = null;
    state.pendingSync = null;
    state.pauseAfterLoad = null;
    state.clock = { time: 0, at: Date.now(), playing: false };
    state.rendered.clear();

    if (state.playerReady) {
      try {
        state.player.stopVideo();
      } catch {}
    }

    els.chatMessages.innerHTML = "";
    els.queueList.innerHTML = "";
    els.suggestList.innerHTML = "";
    els.suggestCount.textContent = "0";
    els.nowPlaying.innerHTML = '<span class="np-empty">Nada reproduciéndose todavía</span>';
    els.playerGate.classList.add("hidden");
    els.soundPill.classList.add("hidden");
    closeImmersive();
    hangupVoice();
    els.viewRoom.classList.add("hidden");
    els.viewHome.classList.remove("hidden");
    document.body.classList.remove("in-room", "is-host");
    showCover(true);
    history.replaceState(null, "", location.pathname);
  }

  /* ------------------------------------------------------------
     Estado de la sala
     ------------------------------------------------------------ */

  function applyRoomState(room) {
    if (!room) return;
    state.room = room;
    state.isHost = room.hostId === state.youId;

    els.roomCode.textContent = room.code;
    renderMembers(room.members || []);
    renderQueue(room.queue || []);
    renderSuggestions(room.suggestions || []);
    renderNowPlaying(room.current);
    updateHostUI();
    updateKeyUI();
    showCover(!room.current);
    syncFromState(room);
  }

  function syncFromState(room) {
    if (!room) return;
    if (room.current) {
      const sync = {
        videoId: room.current.videoId,
        playing: room.playing,
        time: room.time,
        at: room.updatedAt,
        reason: "state",
      };
      if (!state.lastSync || state.lastSync.videoId !== sync.videoId || !state.playerReady) {
        handleSync(sync);
      }
    } else if (state.lastSync) {
      handleSync({
        videoId: null,
        playing: false,
        time: 0,
        at: Date.now(),
        reason: "state",
      });
    }
  }

  function updateHostUI() {
    els.hostTools.classList.toggle("hidden", !state.isHost);
    els.btnNext.classList.toggle("hidden", !state.isHost);
    els.seek.disabled = !state.isHost;
    els.hostHint.textContent = state.isHost
      ? "👑 Eres el host: elige videos y controla la reproducción"
      : "👀 Solo el host controla la reproducción";
    document.body.classList.toggle("is-host", state.isHost);
  }

  function updateKeyUI() {
    const hasKey = Boolean(state.room?.hasKey);
    const share = Boolean(state.room?.shareKey);
    els.shareKey.checked = share;
    if (state.apiKey) els.apiKey.value = state.apiKey;

    if (state.isHost) {
      els.guestNote.classList.add("hidden");
    } else {
      els.guestNote.classList.remove("hidden");
      els.guestNote.textContent = hasKey
        ? share
          ? "El host comparte su API key: puedes buscar con “Explorar YouTube”."
          : "El host no comparte su API key. Pídesela por el chat."
        : "El host aún no configuró su API key. Pídesela por el chat.";
    }

    if (!els.immersive.classList.contains("hidden")) {
      updateYtGate();
    }
  }

  function showCover(show) {
    els.playerCover.classList.toggle("hidden", !show);
    if (show) {
      els.coverText.textContent = state.isHost
        ? "Agrega un video para empezar"
        : "Esperando a que el host ponga un video";
    }
  }

  function renderMembers(members) {
    els.members.innerHTML = "";
    els.memberCount.textContent = members.length;

    members.slice(0, 8).forEach((member) => {
      const el = document.createElement("div");
      el.className = "member";
      el.style.setProperty("--h", String(hueFor(member.name)));
      el.textContent = initials(member.name);
      el.title = `${member.name}${member.isHost ? " · Host" : ""}`;

      if (member.isHost) {
        const crown = document.createElement("span");
        crown.className = "crown";
        crown.textContent = "👑";
        el.appendChild(crown);
      }
      els.members.appendChild(el);
    });

    if (members.length > 8) {
      const more = document.createElement("div");
      more.className = "member";
      more.style.setProperty("--h", "260");
      more.textContent = `+${members.length - 8}`;
      els.members.appendChild(more);
    }
  }

  function renderQueue(queue) {
    els.queueCount.textContent = queue.length;
    els.queueEmpty.classList.toggle("hidden", queue.length > 0);
    els.queueList.innerHTML = "";

    queue.forEach((item) => {
      const li = document.createElement("li");
      li.className = "queue-item";

      const img = document.createElement("img");
      img.src = item.thumb;
      img.alt = "";
      img.loading = "lazy";

      const info = document.createElement("div");
      info.className = "q-info";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const author = document.createElement("small");
      author.textContent = item.author || "YouTube";
      info.append(title, author);

      li.append(img, info);

      if (state.isHost) {
        li.classList.add("clickable");
        li.title = "Reproducir ahora";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "q-remove";
        remove.textContent = "×";
        remove.title = "Quitar de la cola";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          socket.emit("queue:remove", { id: item.id });
        });
        li.appendChild(remove);

        li.addEventListener("click", () => {
          socket.emit("player:playItem", { id: item.id });
        });
      }

      els.queueList.appendChild(li);
    });
  }

  function renderNowPlaying(current) {
    if (!current) {
      els.nowPlaying.innerHTML = '<span class="np-empty">Nada reproduciéndose todavía</span>';
      return;
    }

    els.nowPlaying.innerHTML = "";

    const label = document.createElement("span");
    label.className = "np-label";
    label.textContent = "AHORA";

    const info = document.createElement("div");
    info.className = "np-info";
    const title = document.createElement("strong");
    title.textContent = current.title;
    const author = document.createElement("small");
    author.textContent = current.author || "YouTube";
    info.append(title, author);

    els.nowPlaying.append(label, info);
  }

  /* ------------------------------------------------------------
     Reproductor
     ------------------------------------------------------------ */

  function onYtReady() {
    state.ytReady = true;
    ensurePlayer();
  }

  function ensurePlayer() {
    if (state.player || !state.room) return;
    if (!window.YT || !window.YT.Player) return;

    state.player = new window.YT.Player("yt-player", {
      width: "100%",
      height: "100%",
      videoId: "",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
        fs: 0,
        origin: location.origin,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  }

  function onPlayerReady() {
    state.playerReady = true;
    if (!state.isHost) {
      try {
        state.player.mute();
      } catch {}
    }
    if (state.pendingSync) {
      const pending = state.pendingSync;
      state.pendingSync = null;
      handleSync(pending);
    }
    updateSoundPill();
    tick();
  }

  function onPlayerStateChange(event) {
    if (event.data === 0) {
      if (state.isHost && state.room?.current) socket.emit("player:next");
    }

    if (event.data === 1) {
      els.playerGate.classList.add("hidden");
      if (state.pauseAfterLoad != null && state.playerReady) {
        const target = state.pauseAfterLoad;
        state.pauseAfterLoad = null;
        try {
          state.player.seekTo(target, true);
          state.player.pauseVideo();
        } catch {}
      }
    }

    updatePlayIcon();
    updateSoundPill();
  }

  function onPlayerError(event) {
    const code = event.data;
    let message = "No se pudo reproducir este video.";
    if (code === 101 || code === 150) {
      message = "Este video no permite reproducción incrustada.";
    } else if (code === 100) {
      message = "El video no existe o es privado.";
    }
    toast(`⚠️ ${message}`);

    if (state.isHost && state.room?.current) {
      setTimeout(() => {
        if (state.room?.current) socket.emit("player:next");
      }, 1500);
    }
  }

  function handleSync(sync) {
    state.lastSync = sync;
    state.clock = { time: sync.time, at: sync.at, playing: Boolean(sync.playing) };

    if (state.room) {
      state.room.playing = sync.playing;
      state.room.time = sync.time;
      state.room.updatedAt = sync.at;
    }

    if (!sync.videoId) {
      state.pendingSync = null;
      state.pauseAfterLoad = null;
      showCover(true);
      renderNowPlaying(null);
      if (state.playerReady) {
        try {
          state.player.stopVideo();
        } catch {}
      }
      updateSoundPill();
      return;
    }

    showCover(false);

    if (state.isHost && sync.reason !== "load") {
      updateSoundPill();
      return;
    }

    if (!state.playerReady) {
      state.pendingSync = sync;
      return;
    }

    const player = state.player;
    const target = sync.playing
      ? sync.time + (Date.now() - sync.at) / 1000
      : sync.time;

    let currentId = "";
    try {
      currentId = player.getVideoData()?.video_id || "";
    } catch {}

    if (currentId !== sync.videoId) {
      state.pauseAfterLoad = sync.playing ? null : target;
      player.loadVideoById({
        videoId: sync.videoId,
        startSeconds: Math.max(0, target),
      });
      if (!state.isHost) {
        try {
          player.mute();
        } catch {}
      }
      updateSoundPill();
      return;
    }

    if (sync.playing) {
      if (Math.abs(player.getCurrentTime() - target) > 1.2) {
        player.seekTo(Math.max(0, target), true);
      }
      const playerState = player.getPlayerState();
      if (playerState !== 1 && playerState !== 3) player.playVideo();
    } else {
      if (player.getPlayerState() === 1) player.pauseVideo();
      if (Math.abs(player.getCurrentTime() - target) > 0.6) {
        player.seekTo(Math.max(0, target), true);
      }
    }

    updateSoundPill();
  }

  function togglePlay() {
    if (!state.room?.current || !state.playerReady) return;

    if (state.isHost) {
      if (state.player.getPlayerState() === 1) {
        state.player.pauseVideo();
        socket.emit("player:pause", { time: state.player.getCurrentTime() });
      } else {
        state.player.playVideo();
        socket.emit("player:play", { time: state.player.getCurrentTime() });
      }
    } else {
      resync();
    }
  }

  function resync() {
    if (!state.playerReady || !state.lastSync?.videoId) return;
    const sync = state.lastSync;
    const target = sync.playing
      ? sync.time + (Date.now() - sync.at) / 1000
      : sync.time;
    state.player.seekTo(Math.max(0, target), true);
    if (sync.playing) state.player.playVideo();
    els.playerGate.classList.add("hidden");
    toast("🔄 Sincronizado");
  }

  function updatePlayIcon() {
    if (!state.playerReady) {
      els.btnPlay.innerHTML = ICONS.play;
      return;
    }
    const playing = state.player.getPlayerState() === 1;
    els.btnPlay.innerHTML = playing ? ICONS.pause : ICONS.play;
    els.btnPlay.title = state.isHost
      ? playing
        ? "Pausar"
        : "Reproducir"
      : "Sincronizar";
  }

  function updateSoundPill() {
    if (!state.playerReady || !state.room?.current) {
      els.soundPill.classList.add("hidden");
      return;
    }
    let muted = false;
    try {
      muted = state.player.isMuted();
    } catch {}
    els.soundPill.classList.toggle("hidden", !muted);
    els.btnVol.innerHTML = muted ? ICONS.volumeOff : ICONS.volumeOn;
  }

  function toggleMute() {
    if (!state.playerReady) return;
    try {
      if (state.player.isMuted()) {
        state.player.unMute();
        state.player.setVolume(100);
      } else {
        state.player.mute();
      }
    } catch {}
    updateSoundPill();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      els.playerWrap.requestFullscreen?.().catch(() => {});
    }
  }

  function tick() {
    if (!state.room || !state.playerReady) return;
    const player = state.player;
    const current = safe(() => player.getCurrentTime(), 0);
    const duration = safe(() => player.getDuration(), 0);

    if (!state.seeking) {
      const max = duration || 100;
      els.seek.max = String(max);
      els.seek.value = String(Math.min(current, max));
      els.seek.style.setProperty(
        "--p",
        `${duration ? (current / duration) * 100 : 0}%`
      );
    }

    els.timeCurrent.textContent = fmt(current);
    els.timeTotal.textContent = duration ? fmt(duration) : "0:00";
    updatePlayIcon();
    updateSoundPill();
  }

  function hostHeartbeat() {
    if (!state.isHost || !state.room?.current || !state.room.playing) return;
    if (!state.playerReady) return;
    if (state.player.getPlayerState() !== 1) return;
    socket.emit("player:heartbeat", { time: state.player.getCurrentTime() });
  }

  /* ------------------------------------------------------------
     Chat
     ------------------------------------------------------------ */

  function renderMessage(message) {
    if (!message || !message.id || state.rendered.has(message.id)) return;
    state.rendered.add(message.id);

    const wrapper = document.createElement("div");

    if (message.type === "system") {
      wrapper.className = "msg system";
      wrapper.textContent = message.text;
    } else {
      const mine = message.fromId === state.youId;
      wrapper.className = `msg${mine ? " mine" : ""}`;

      const head = document.createElement("div");
      head.className = "msg-head";

      const name = document.createElement("span");
      name.className = "msg-name";
      name.textContent = mine ? "Tú" : message.name;

      const time = document.createElement("span");
      time.className = "msg-time";
      time.textContent = fmtTime(message.at);

      head.append(name, time);

      const body = document.createElement("div");
      body.className = "msg-body";
      body.textContent = message.text;

      wrapper.append(head, body);
    }

    els.chatMessages.appendChild(wrapper);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  /* ------------------------------------------------------------
     Búsqueda y cola
     ------------------------------------------------------------ */

  async function addVideo(video) {
    if (!state.isHost) return { ok: false, error: "Solo el host puede agregar videos." };
    const response = await emitAck("queue:add", { video });
    if (response.ok) toast("✅ Agregado a la cola");
    else toast(response.error || "No se pudo agregar el video");
    return response;
  }

  async function saveKey(key, share) {
    if (!state.isHost) {
      toast("Solo el host configura la API key");
      return false;
    }
    key = String(key ?? "").trim();
    state.apiKey = key;
    state.shareKey = Boolean(share);

    if (key) localStorage.setItem("multitube:key", key);
    else localStorage.removeItem("multitube:key");
    localStorage.setItem("multitube:share", state.shareKey ? "1" : "0");
    els.apiKey.value = key;
    els.shareKey.checked = state.shareKey;

    const response = await emitAck("key:set", { key, share: state.shareKey });
    if (!response.ok) {
      toast(response.error || "No se pudo guardar la key");
      return false;
    }
    if (state.room) {
      state.room.hasKey = Boolean(key);
      state.room.shareKey = state.shareKey;
    }
    updateKeyUI();
    toast(key ? "🔑 API key guardada y compartida con la sala" : "API key eliminada");
    return true;
  }

  function openImmersive() {
    if (!state.room) return;
    els.immersive.classList.remove("hidden");
    document.body.classList.add("immersive-open");
    els.ytMode.textContent = state.isHost
      ? "Host · tu key"
      : "Invitado · key del host";
    updateYtGate();
    if (state.room.hasKey && (state.isHost || state.room.shareKey)) {
      if (!els.ytGrid.children.length) {
        ytRecommendations();
      } else {
        els.ytEmpty.classList.toggle("hidden", Boolean(els.ytGrid.children.length));
        els.ytLoadMore.classList.toggle("hidden", !state.ytNextToken);
      }
      setTimeout(() => els.ytSearchInput.focus(), 80);
    }
  }

  function closeImmersive() {
    els.immersive.classList.add("hidden");
    document.body.classList.remove("immersive-open");
    els.ytStatus.textContent = "";
    els.ytStatus.classList.remove("error");
    els.ytLoadMore.classList.add("hidden");
    els.ytRetry.classList.add("hidden");
  }

  function updateYtGate() {
    const hasKey = Boolean(state.room?.hasKey);
    const share = Boolean(state.room?.shareKey);
    if (hasKey && (state.isHost || share)) {
      els.ytGate.classList.add("hidden");
      return;
    }
    els.ytGate.classList.remove("hidden");
    els.ytGateRow.classList.toggle("hidden", !state.isHost);
    if (!hasKey) {
      els.ytGateTitle.textContent = state.isHost
        ? "Agrega tu API key"
        : "El host no configuró su key";
      els.ytGateText.textContent = state.isHost
        ? "Pégala aquí para buscar y compartirla con la sala. Solo se guarda en memoria."
        : "Pídele al host que agregue su API key para poder buscar juntos.";
    } else {
      els.ytGateTitle.textContent = "Búsqueda desactivada";
      els.ytGateText.textContent = "El host no compartió su API key con los invitados.";
    }
    if (state.isHost) els.ytGateInput.value = state.apiKey || "";
  }

  async function ytSearch(query) {
    query = String(query || "").trim();
    state.ytMode = "search";
    state.ytQuery = query;
    state.ytNextToken = null;
    state.ytLoadingMore = false;

    if (!query) {
      ytRecommendations();
      return;
    }
    if (!state.room) return;
    if (!state.room.hasKey) {
      updateYtGate();
      return;
    }
    if (!state.isHost && !state.room.shareKey) {
      updateYtGate();
      return;
    }

    els.ytEmpty.classList.add("hidden");
    els.ytGate.classList.add("hidden");
    els.ytStatus.textContent = "Buscando…";
    els.ytStatus.classList.remove("error");
    renderYtSkeletons();

    const response = await emitAck("search:query", { q: query }, 25000);
    if (!response.ok) {
      els.ytGrid.innerHTML = "";
      els.ytEmpty.classList.add("hidden");
      els.ytStatus.textContent = response.error || "No se pudo buscar.";
      els.ytStatus.classList.add("error");
      els.ytLoadMore.classList.add("hidden");
      els.ytRetry.classList.remove("hidden");
      return;
    }

    els.ytStatus.classList.remove("error");
    els.ytRetry.classList.add("hidden");
    els.ytGrid.innerHTML = "";
    renderYtResults(response.items || [], false);
    state.ytNextToken = response.nextPageToken || null;
    if (!(response.items || []).length) {
      els.ytEmpty.classList.remove("hidden");
      els.ytLoadMore.classList.add("hidden");
      els.ytLoadMore.textContent = "Cargar más resultados";
    } else {
      els.ytLoadMore.classList.toggle("hidden", !state.ytNextToken);
      els.ytLoadMore.textContent = state.ytNextToken ? "Cargar más resultados" : "No hay más resultados";
      els.ytLoadMore.disabled = !state.ytNextToken;
    }
  }

  async function loadMoreYt() {
    if (state.ytLoadingMore || !state.ytNextToken) return;
    if (els.immersive.classList.contains("hidden")) return;
    state.ytLoadingMore = true;

    const token = state.ytNextToken;
    els.ytLoadMore.disabled = true;
    els.ytLoadMore.textContent = "Cargando…";

    let response;
    if (state.ytMode === "recommendations") {
      response = await emitAck("recommendations:get", {
        region: state.ytRegion,
        pageToken: token,
      }, 25000);
    } else {
      response = await emitAck("search:query", {
        q: state.ytQuery,
        pageToken: token,
      }, 25000);
    }

    state.ytLoadingMore = false;
    els.ytLoadMore.disabled = false;
    els.ytLoadMore.textContent = "Cargar más resultados";

    if (!response.ok) {
      els.ytStatus.textContent = response.error || "No se pudo cargar más.";
      els.ytStatus.classList.add("error");
      return;
    }

    if (response.items?.length) {
      renderYtResults(response.items, true);
    }
    state.ytNextToken = response.nextPageToken || null;
    els.ytLoadMore.classList.toggle("hidden", !state.ytNextToken);
    if (!state.ytNextToken) {
      els.ytStatus.textContent = `${els.ytGrid.children.length} resultados · fin`;
    }
  }

  async function ytRecommendations() {
    if (!state.room) return;
    if (!state.room.hasKey) {
      updateYtGate();
      return;
    }
    if (!state.isHost && !state.room.shareKey) {
      updateYtGate();
      return;
    }

    state.ytMode = "recommendations";
    state.ytQuery = "";
    state.ytNextToken = null;
    state.ytLoadingMore = false;
    const rawRegion = (navigator.language || "en-US").slice(-2).toUpperCase();
    state.ytRegion = state.ytRegion || (/^[A-Z]{2}$/.test(rawRegion) ? rawRegion : "US");

    els.ytEmpty.classList.add("hidden");
    els.ytGate.classList.add("hidden");
    els.ytStatus.textContent = "Cargando recomendaciones…";
    els.ytStatus.classList.remove("error");
    els.ytLoadMore.classList.add("hidden");
    renderYtSkeletons();

    const response = await emitAck("recommendations:get", { region: state.ytRegion }, 25000);
    if (!response.ok) {
      els.ytGrid.innerHTML = "";
      els.ytStatus.textContent = response.error || "No se pudieron cargar recomendaciones.";
      els.ytStatus.classList.add("error");
      els.ytEmpty.classList.remove("hidden");
      els.ytLoadMore.classList.add("hidden");
      els.ytRetry.classList.remove("hidden");
      return;
    }

    els.ytStatus.classList.remove("error");
    els.ytRetry.classList.add("hidden");
    els.ytGrid.innerHTML = "";
    renderYtResults(response.items || [], false);
    state.ytNextToken = response.nextPageToken || null;
    if (!(response.items || []).length) {
      els.ytEmpty.classList.remove("hidden");
      els.ytStatus.textContent = "No hay recomendaciones disponibles.";
      els.ytLoadMore.classList.add("hidden");
    } else {
      els.ytStatus.textContent = `${(response.items || []).length} recomendados · ${
        state.isHost ? "se agregan a la cola" : "se sugieren al host"
      }`;
      els.ytLoadMore.classList.toggle("hidden", !state.ytNextToken);
      els.ytLoadMore.textContent = state.ytNextToken ? "Cargar más resultados" : "No hay más resultados";
      els.ytLoadMore.disabled = !state.ytNextToken;
    }
  }

  function renderYtSkeletons() {
    els.ytGrid.innerHTML = "";
    for (let i = 0; i < 8; i += 1) {
      const card = document.createElement("div");
      card.className = "yt-card";
      const thumb = document.createElement("div");
      thumb.className = "yt-skeleton-thumb";
      const line1 = document.createElement("div");
      line1.className = "yt-skeleton-line";
      const line2 = document.createElement("div");
      line2.className = "yt-skeleton-line short";
      card.append(thumb, line1, line2);
      els.ytGrid.appendChild(card);
    }
  }

  function renderYtResults(items, append = false) {
    if (!append) els.ytGrid.innerHTML = "";
    if (!items.length && !append) {
      els.ytStatus.textContent = "No se encontraron videos.";
      els.ytEmpty.classList.remove("hidden");
      return;
    }
    els.ytEmpty.classList.add("hidden");
    els.ytStatus.textContent = `${els.ytGrid.children.length + items.length} resultados · ${
      state.isHost ? "se agregan a la cola" : "se sugieren al host"
    }${state.ytNextToken ? " · baja para ver más" : ""}`;

    items.forEach((video) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "yt-card";

      const thumb = document.createElement("div");
      thumb.className = "yt-thumb";

      const img = document.createElement("img");
      img.src = video.thumb;
      img.alt = "";
      img.loading = "lazy";

      const duration = document.createElement("span");
      duration.className = "yt-duration";
      duration.textContent = video.duration || "";

      const add = document.createElement("div");
      add.className = "yt-add";
      const addSpan = document.createElement("span");
      addSpan.textContent = state.isHost ? "＋ Añadir a la cola" : "＋ Sugerir al host";
      add.appendChild(addSpan);

      thumb.append(img, duration, add);

      const body = document.createElement("div");
      body.className = "yt-card-body";

      const avatar = document.createElement("div");
      avatar.className = "yt-avatar";
      avatar.style.setProperty("--h", String(hueFor(video.author || video.title)));
      avatar.textContent = initials(video.author || "YT");

      const info = document.createElement("div");
      info.className = "yt-card-info";

      const title = document.createElement("div");
      title.className = "yt-card-title";
      title.textContent = video.title;

      const meta = document.createElement("div");
      meta.className = "yt-card-meta";
      const line1 = document.createElement("div");
      line1.textContent = video.author || "YouTube";
      const line2 = document.createElement("div");
      line2.textContent = [video.views, video.ago].filter(Boolean).join(" · ");
      meta.append(line1, line2);

      info.append(title, meta);
      body.append(avatar, info);
      card.append(thumb, body);

      card.addEventListener("click", () => pickYtVideo(video));
      els.ytGrid.appendChild(card);
    });
  }

  async function pickYtVideo(video) {
    if (state.isHost) {
      const response = await addVideo(video);
      if (response.ok) closeImmersive();
    } else {
      await suggestVideo(video);
    }
  }

  async function suggestVideo(video) {
    const response = await emitAck("suggest:add", { video });
    if (response.ok) {
      toast("📨 Sugerencia enviada al host");
      closeImmersive();
    } else {
      toast(response.error || "No se pudo enviar la sugerencia");
    }
  }

  function renderSuggestions(list) {
    els.suggestCount.textContent = list.length;
    els.suggestEmpty.classList.toggle("hidden", list.length > 0);
    els.suggestList.innerHTML = "";

    list.forEach((suggestion) => {
      const li = document.createElement("li");
      li.className = "suggest-item";

      const img = document.createElement("img");
      img.src = suggestion.thumb;
      img.alt = "";
      img.loading = "lazy";

      const info = document.createElement("div");
      info.className = "suggest-info";

      const title = document.createElement("strong");
      title.textContent = suggestion.title;

      const author = document.createElement("small");
      author.textContent = `${suggestion.author || "YouTube"} · sugerido por ${suggestion.fromName}`;

      info.append(title, author);
      li.append(img, info);

      if (state.isHost) {
        const actions = document.createElement("div");
        actions.className = "suggest-actions";

        const accept = document.createElement("button");
        accept.type = "button";
        accept.className = "suggest-btn accept";
        accept.textContent = "✓";
        accept.title = "Aceptar y agregar a la cola";
        accept.addEventListener("click", () =>
          socket.emit("suggest:accept", { id: suggestion.id })
        );

        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "suggest-btn reject";
        reject.textContent = "✕";
        reject.title = "Rechazar";
        reject.addEventListener("click", () =>
          socket.emit("suggest:reject", { id: suggestion.id })
        );

        actions.append(accept, reject);
        li.appendChild(actions);
      } else if (suggestion.fromId === state.youId) {
        const actions = document.createElement("div");
        actions.className = "suggest-actions";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "suggest-btn remove";
        remove.textContent = "×";
        remove.title = "Quitar mi sugerencia";
        remove.addEventListener("click", () =>
          socket.emit("suggest:remove", { id: suggestion.id })
        );

        actions.appendChild(remove);
        li.appendChild(actions);
      } else {
        const pending = document.createElement("span");
        pending.className = "suggest-btn";
        pending.textContent = "⏳";
        pending.title = "Pendiente de aprobación";
        li.appendChild(pending);
      }

      els.suggestList.appendChild(li);
    });
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

  async function addFromUrl() {
    if (!state.isHost) return;

    const raw = els.urlInput.value.trim();
    if (!raw) return;

    const videoId = parseYouTubeId(raw);
    if (!videoId) return toast("❌ Link de YouTube inválido");

    els.btnAddUrl.disabled = true;
    const meta = await fetchOEmbed(videoId);
    const response = await addVideo({
      videoId,
      title: meta?.title || "Video de YouTube",
      author: meta?.author_name || "",
    });
    els.btnAddUrl.disabled = false;

    if (response.ok) els.urlInput.value = "";
  }

  /* ------------------------------------------------------------
     Chat de voz y video (WebRTC)
     ------------------------------------------------------------ */

  const RTC_CONFIG = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  function updateVoiceCount() {
    const count = state.voicePeers.size + (state.voiceActive ? 1 : 0);
    els.voiceCount.textContent = state.voicePeers.size;
  }

  function updateVoiceUI() {
    const active = state.voiceActive || !!state.localAudioStream || !!state.localVideoStream;
    if (els.voiceControls) els.voiceControls.classList.toggle("hidden", active);
    if (els.voiceActive) els.voiceActive.classList.toggle("hidden", !active);
    els.voiceStatus.textContent = active
      ? `Conectado · ${state.voicePeers.size} en voz`
      : "Chat de voz desactivado";

    els.voiceMic.textContent = state.localAudioStream?.getAudioTracks()[0]?.enabled
      ? "🎤 Mic on"
      : "🔇 Mic off";
    els.voiceCam.textContent = state.localVideoStream?.getVideoTracks()[0]?.enabled
      ? "📹 Cámara on"
      : "🚫 Cámara off";
  }

  function createFloater(id, name, stream) {
    if (state.voiceFloaters.has(id)) {
      const existing = state.voiceFloaters.get(id);
      if (stream) updateFloaterMedia(existing, stream);
      return existing;
    }

    const el = document.createElement("div");
    el.className = "voice-floater";
    el.dataset.peer = id;

    const bar = document.createElement("div");
    bar.className = "voice-floater-bar";

    const nameEl = document.createElement("span");
    nameEl.className = "voice-floater-name";
    nameEl.textContent = name || "Participante";

    const closeBtn = document.createElement("button");
    closeBtn.className = "voice-floater-close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.title = "Ocultar";
    closeBtn.addEventListener("click", () => {
      el.style.display = "none";
    });

    bar.append(nameEl, closeBtn);

    const video = document.createElement("video");
    video.className = "voice-floater-video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = id === "self";

    const audioTile = document.createElement("div");
    audioTile.className = "voice-floater-audio";
    const avatar = document.createElement("div");
    avatar.className = "voice-floater-avatar";
    avatar.style.setProperty("--h", String(hueFor(name || "P")));
    avatar.textContent = initials(name || "P");
    const small = document.createElement("small");
    small.textContent = "🎤 en voz";
    audioTile.append(avatar, small);

    el.append(bar, video, audioTile);

    // Posición en cascada desde el centro
    const idx = state.floaterIndex++;
    const baseX = window.innerWidth / 2 - 115 + (idx % 4) * 24;
    const baseY = window.innerHeight / 2 - 90 + (idx % 4) * 24;
    el.style.left = `${Math.max(8, baseX)}px`;
    el.style.top = `${Math.max(8, baseY)}px`;

    els.voiceFloaters.appendChild(el);

    const floater = { el, video, audioTile, name };
    state.voiceFloaters.set(id, floater);

    makeDraggable(el, bar);

    if (stream) updateFloaterMedia(floater, stream);

    return floater;
  }

  function updateFloaterMedia(floater, stream) {
    if (!floater || !stream) return;
    const hasVideo = stream.getVideoTracks().length > 0;
    if (hasVideo) {
      floater.video.srcObject = stream;
      floater.video.style.display = "block";
      floater.audioTile.style.display = "none";
    } else {
      floater.video.style.display = "none";
      floater.audioTile.style.display = "flex";
    }
  }

  function removeFloater(id) {
    const floater = state.voiceFloaters.get(id);
    if (!floater) return;
    floater.el.remove();
    state.voiceFloaters.delete(id);
  }

  function makeDraggable(el, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const startDrag = (clientX, clientY) => {
      dragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      el.style.zIndex = "71";
    };

    const moveDrag = (clientX, clientY) => {
      if (!dragging) return;
      let x = clientX - offsetX;
      let y = clientY - offsetY;
      x = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, x));
      y = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, y));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };

    const endDrag = () => {
      if (dragging) {
        dragging = false;
        el.style.zIndex = "70";
      }
    };

    handle.addEventListener("mousedown", (e) => {
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });
    handle.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
      e.preventDefault();
    }, { passive: false });

    const onMouseMove = (e) => moveDrag(e.clientX, e.clientY);
    const onTouchMove = (e) => {
      if (e.touches && e.touches.length) {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
      e.preventDefault();
    };
    const onEnd = () => endDrag();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }

  function createPeerConnection(peerId, isInitiator) {
    if (state.voicePeers.has(peerId)) {
      return state.voicePeers.get(peerId).pc;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);

    if (state.localAudioStream) {
      state.localAudioStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, state.localAudioStream);
      });
    }
    if (state.localVideoStream) {
      state.localVideoStream.getVideoTracks().forEach((track) => {
        pc.addTrack(track, state.localVideoStream);
      });
    }

    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    // Keep audio element in the DOM so it can play (some browsers need it attached)
    remoteAudio.style.display = "none";
    document.body.appendChild(remoteAudio);

    const peer = {
      pc,
      audio: remoteAudio,
      video: null,
      container: null,
      stream: new MediaStream(),
      name: (state.voicePeerNames && state.voicePeerNames.get(peerId)) || "Participante",
    };
    state.voicePeers.set(peerId, peer);

    pc.ontrack = (event) => {
      const track = event.track;
      peer.stream.addTrack(track);
      if (track.kind === "audio") {
        remoteAudio.srcObject = peer.stream;
        remoteAudio.play().catch(() => {});
      }
      const floater = state.voiceFloaters.get(peerId);
      if (floater) {
        updateFloaterMedia(floater, peer.stream);
      } else {
        createFloater(peerId, peer.name, peer.stream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("voice:ice", { to: peerId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removeVoicePeer(peerId);
      }
    };

    if (isInitiator) {
      (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("voice:offer", { to: peerId, sdp: pc.localDescription });
        } catch (error) {
          console.error("createOffer error", error);
        }
      })();
    }

    return pc;
  }

  function removeVoicePeer(peerId) {
    const peer = state.voicePeers.get(peerId);
    if (peer) {
      try {
        peer.pc.close();
      } catch {}
      peer.audio?.remove();
      peer.video?.remove();
      peer.container?.remove();
      state.voicePeers.delete(peerId);
    }
    removeFloater(peerId);
    updateVoiceCount();
    updateVoiceUI();
  }

  function askPermissionModal(icon, title, text, constraints) {
    return new Promise((resolve) => {
      els.voicePermIcon.textContent = icon;
      els.voicePermTitle.textContent = title;
      els.voicePermText.textContent = text;
      els.voicePerm.classList.remove("hidden");
      document.body.classList.add("modal-open");

      const cleanup = () => {
        els.voicePerm.classList.add("hidden");
        document.body.classList.remove("modal-open");
        els.voicePermYes.onclick = null;
        els.voicePermNo.onclick = null;
      };

      els.voicePermYes.onclick = async () => {
        if (constraints) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            cleanup();
            resolve(stream);
            return;
          } catch (error) {
            cleanup();
            toast(`${title.includes("voz") ? "Micrófono" : "Cámara"}: ${error.name || "error"} - ${error.message || "sin permiso"}`);
            resolve(null);
            return;
          }
        }
        cleanup();
        resolve(true);
      };
      els.voicePermNo.onclick = () => {
        cleanup();
        resolve(null);
      };
    });
  }

  async function askVoiceAndCamera(force = false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Tu navegador no soporta cámara/micrófono. Usa HTTPS o localhost.");
      return;
    }
    if (state.voiceAsked && !force) {
      // Ya preguntamos antes en esta sesión; si aceptó, reactivar automáticamente
      if (localStorage.getItem("multitube:voicePref") === "yes") {
        await startVoice(true);
      } else {
        toast("Activaste 'No' antes. Usa el botón para reactivar.");
      }
      return;
    }
    state.voiceAsked = true;
    sessionStorage.setItem("multitube:voiceAsked", "1");

    const audioStream = await askPermissionModal(
      "🎤",
      "¿Quieres usar chat de voz?",
      "Se te pedirá permiso para el micrófono.",
      { audio: true }
    );
    const wantVoice = !!audioStream;
    localStorage.setItem("multitube:voicePref", wantVoice ? "yes" : "no");

    if (wantVoice) {
      state.localAudioStream = audioStream;
      state.voiceActive = true;
    } else {
      state.voiceActive = false;
    }

    const videoStream = await askPermissionModal(
      "📹",
      "¿Quieres usar la cámara?",
      "Se te pedirá permiso para la cámara.",
      { video: true }
    );
    if (videoStream) {
      state.localVideoStream = videoStream;
      if (state.voiceLocal) {
        const combined = new MediaStream();
        if (state.localAudioStream) state.localAudioStream.getAudioTracks().forEach((t) => combined.addTrack(t));
        state.localVideoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
        state.voiceLocal.srcObject = combined;
      }
      // Renegociar con los peers existentes
      for (const [peerId, peer] of state.voicePeers) {
        state.localVideoStream.getVideoTracks().forEach((track) => {
          peer.pc.addTrack(track, state.localVideoStream);
        });
        try {
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          socket.emit("voice:offer", { to: peerId, sdp: peer.pc.localDescription });
        } catch (e) {
          console.error("renegotiate error", e);
        }
      }
      updateVoiceUI();
    }

    if (state.voiceActive || state.localVideoStream) {
      await startVoice(false);
    } else {
      updateVoiceUI();
    }
  }

  async function startVoice(isAuto) {
    state.voiceActive = state.voiceActive || !!state.localAudioStream || !!state.localVideoStream;
    if (!state.voiceActive && !state.localAudioStream && !state.localVideoStream) return;

    if (state.voiceLocal && (state.localVideoStream || state.localAudioStream)) {
      const combined = new MediaStream();
      if (state.localAudioStream) state.localAudioStream.getAudioTracks().forEach((t) => combined.addTrack(t));
      if (state.localVideoStream) state.localVideoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
      state.voiceLocal.srcObject = combined;
    }

    socket.emit("voice:join", {}, (response) => {
      if (!response?.ok) {
        toast(response?.error || "No se pudo unir al chat de voz");
        return;
      }
      const peers = response.peers || [];
      peers.forEach((peer) => {
        const peerId = typeof peer === "string" ? peer : peer.id;
        const name = typeof peer === "string" ? "Participante" : peer.name;
        if (!state.voicePeerNames) state.voicePeerNames = new Map();
        state.voicePeerNames.set(peerId, name);
        createFloater(peerId, name, null);
        createPeerConnection(peerId, true);
      });
      updateVoiceUI();
      updateVoiceCount();
    });

    // Vista propia (audio y/o video) -> ventanita flotante inmediata
    if (state.localAudioStream || state.localVideoStream) {
      const selfStream = new MediaStream();
      if (state.localAudioStream) state.localAudioStream.getAudioTracks().forEach((t) => selfStream.addTrack(t));
      if (state.localVideoStream) state.localVideoStream.getVideoTracks().forEach((t) => selfStream.addTrack(t));
      createFloater("self", "Tú", selfStream);
    }

    updateVoiceUI();
  }

  function toggleMic() {
    if (!state.localAudioStream) return;
    const track = state.localAudioStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    updateVoiceUI();
  }

  function toggleCam() {
    if (!state.localVideoStream) {
      // pedir cámara ahora
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          state.localVideoStream = stream;
          if (state.voiceLocal) {
            const combined = new MediaStream();
            if (state.localAudioStream) state.localAudioStream.getAudioTracks().forEach((t) => combined.addTrack(t));
            state.localVideoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
          }
          const selfStream = new MediaStream();
          if (state.localAudioStream) state.localAudioStream.getAudioTracks().forEach((t) => selfStream.addTrack(t));
          state.localVideoStream.getVideoTracks().forEach((t) => selfStream.addTrack(t));
          createFloater("self", "Tú", selfStream);
          // agregar track a peers existentes
          for (const [peerId, peer] of state.voicePeers) {
            stream.getVideoTracks().forEach((track) => peer.pc.addTrack(track, stream));
            (async () => {
              try {
                const offer = await peer.pc.createOffer();
                await peer.pc.setLocalDescription(offer);
                socket.emit("voice:offer", { to: peerId, sdp: peer.pc.localDescription });
              } catch (e) {
                console.error("renegotiate error", e);
              }
            })();
          }
          updateVoiceUI();
        })
        .catch(() => toast("No se pudo acceder a la cámara"));
      return;
    }
    const track = state.localVideoStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    updateVoiceUI();
  }

  function hangupVoice() {
    if (!state.voiceActive && !state.localAudioStream && !state.localVideoStream && state.voicePeers.size === 0) return;
    socket.emit("voice:leave");
    if (state.localAudioStream) {
      state.localAudioStream.getTracks().forEach((t) => t.stop());
      state.localAudioStream = null;
    }
    if (state.localVideoStream) {
      state.localVideoStream.getTracks().forEach((t) => t.stop());
      state.localVideoStream = null;
    }
    state.voiceActive = false;
    state.voicePeers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch {}
      peer.audio?.remove();
    });
    state.voicePeers.clear();
    if (state.voiceLocal) state.voiceLocal.srcObject = null;
    // remove all floaters
    for (const id of state.voiceFloaters.keys()) removeFloater(id);
    state.floaterIndex = 0;
    updateVoiceUI();
    updateVoiceCount();
    toast("📞 Colgaste el chat de voz");
  }

  /* ------------------------------------------------------------
     Modal
     ------------------------------------------------------------ */

  function openModal(which) {
    els.modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    els.panelCreate.classList.toggle("hidden", which !== "create");
    els.panelJoin.classList.toggle("hidden", which !== "join");

    setTimeout(() => {
      (which === "create" ? els.createName : els.joinName).focus();
    }, 60);
  }

  function closeModal() {
    els.modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  /* ------------------------------------------------------------
     Eventos de UI
     ------------------------------------------------------------ */

  function bindUI() {
    els.btnCreate.addEventListener("click", () => openModal("create"));
    els.btnJoin.addEventListener("click", () => openModal("join"));
    els.modalClose.addEventListener("click", closeModal);

    els.modal.addEventListener("click", (event) => {
      if (event.target === els.modal) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!els.immersive.classList.contains("hidden")) {
        closeImmersive();
        return;
      }
      closeModal();
    });

    els.createSubmit.addEventListener("click", createRoom);
    els.joinSubmit.addEventListener("click", joinRoom);

    els.createName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") createRoom();
    });

    [els.joinName, els.joinCode].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") joinRoom();
      });
    });

    els.joinCode.addEventListener("input", () => {
      els.joinCode.value = els.joinCode.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
    });

    els.btnCopy.addEventListener("click", copyLink);
    els.btnLeave.addEventListener("click", leaveRoom);

    els.btnPlay.addEventListener("click", togglePlay);
    els.btnNext.addEventListener("click", () => {
      if (state.isHost) socket.emit("player:next");
    });
    els.btnVol.addEventListener("click", toggleMute);
    els.btnFs.addEventListener("click", toggleFullscreen);

    els.playerShield.addEventListener("click", () => {
      if (!state.room?.current) return;
      if (state.isHost) togglePlay();
      else toast("👑 Solo el host controla la reproducción");
    });

    els.playerGate.addEventListener("click", () => {
      els.playerGate.classList.add("hidden");
      if (!state.playerReady) return;
      try {
        state.player.unMute();
        state.player.setVolume(100);
      } catch {}
      updateSoundPill();
      resync();
    });

    els.soundPill.addEventListener("click", () => {
      if (!state.playerReady) return;
      try {
        state.player.unMute();
        state.player.setVolume(100);
      } catch {}
      updateSoundPill();
      if (state.lastSync?.playing) state.player.playVideo();
    });

    els.seek.addEventListener("input", () => {
      if (!state.isHost) return;
      state.seeking = true;
      els.timeCurrent.textContent = fmt(Number(els.seek.value));
    });

    els.seek.addEventListener("change", () => {
      if (!state.isHost) {
        state.seeking = false;
        return;
      }
      const time = Number(els.seek.value);
      state.seeking = false;
      if (state.playerReady) state.player.seekTo(time, true);
      socket.emit("player:seek", { time });
    });

    $$(".tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        $$(".tab-btn").forEach((tab) =>
          tab.classList.toggle("active", tab === button)
        );
        const tab = button.dataset.tab;
        els.tabQueue.classList.toggle("hidden", tab !== "queue");
        els.tabSuggest.classList.toggle("hidden", tab !== "suggest");
        els.tabChat.classList.toggle("hidden", tab !== "chat");
      });
    });

    els.voiceEnable.addEventListener("click", async () => {
      await askVoiceAndCamera(true);
    });
    els.voiceMic.addEventListener("click", toggleMic);
    els.voiceCam.addEventListener("click", toggleCam);
    els.voiceHangup.addEventListener("click", hangupVoice);

    els.btnOpenSearch.addEventListener("click", openImmersive);
    els.ytClose.addEventListener("click", closeImmersive);
    els.ytClose2.addEventListener("click", closeImmersive);
    els.ytGateBack.addEventListener("click", closeImmersive);

    els.ytGateSave.addEventListener("click", async () => {
      const ok = await saveKey(els.ytGateInput.value, true);
      if (ok) {
        els.ytGate.classList.add("hidden");
        const q = els.ytSearchInput.value.trim();
        if (q) ytSearch(q);
        else els.ytSearchInput.focus();
      }
    });

    els.ytGateInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        els.ytGateSave.click();
      }
    });

    els.ytSearchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      ytSearch(els.ytSearchInput.value);
    });

    $$(".yt-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $$(".yt-chip").forEach((c) => c.classList.toggle("active", c === chip));
        const q = chip.dataset.q || "";
        els.ytSearchInput.value = q;
        if (q) ytSearch(q);
        else ytRecommendations();
      });
    });

    els.btnSaveKey.addEventListener("click", async () => {
      await saveKey(els.apiKey.value, els.shareKey.checked);
    });

    els.shareKey.addEventListener("change", () => {
      if (state.isHost) saveKey(els.apiKey.value, els.shareKey.checked);
    });

    els.btnAddUrl.addEventListener("click", addFromUrl);
    els.urlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addFromUrl();
      }
    });

    els.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = els.chatInput.value.trim();
      if (!text) return;
      socket.emit("chat:send", { text });
      els.chatInput.value = "";
    });

    window.addEventListener(
      "scroll",
      () => els.nav.classList.toggle("scrolled", window.scrollY > 8),
      { passive: true }
    );
  }

  async function copyLink() {
    if (!state.room) return;
    const url = `${location.origin}${location.pathname}?room=${state.room.code}`;

    try {
      await navigator.clipboard.writeText(url);
      toast("🔗 Link copiado · compártelo con tus amigos");
      return;
    } catch {}

    const area = document.createElement("textarea");
    area.value = url;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("🔗 Link copiado");
    } catch {
      toast(url);
    }
    area.remove();
  }

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */

  function init() {
    bindUI();
    bindSocket();

    if (state.apiKey) els.apiKey.value = state.apiKey;
    els.shareKey.checked = state.shareKey;

    const params = new URLSearchParams(location.search);
    const roomParam = (params.get("room") || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);

    if (roomParam) {
      if (state.session && state.session.code !== roomParam) clearSession();
      if (!state.session) {
        openModal("join");
        els.joinCode.value = roomParam;
      }
    }

    window.onYouTubeIframeAPIReady = onYtReady;
    if (window.YT && window.YT.Player) onYtReady();

    setInterval(tick, 400);
    setInterval(hostHeartbeat, 5000);

    if (els.ytLoadMore) {
      els.ytLoadMore.addEventListener("click", loadMoreYt);
    }
    if (els.ytRetry) {
      els.ytRetry.addEventListener("click", () => {
        els.ytRetry.classList.add("hidden");
        if (state.ytQuery) ytSearch(state.ytQuery);
        else ytRecommendations();
      });
    }
  }

  init();
})();

import { useEffect, useRef, useState } from "react";
import { API_URL } from "./config";

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("cm_name") || "");
  const [queue, setQueue] = useState([]);
  const [queuePage, setQueuePage] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(70);
  const [toast, setToast] = useState("");
  const wsRef = useRef(null);

  // ---- Sesión de administrador ----
  const [token, setToken] = useState(() => localStorage.getItem("cm_admin_token") || "");
  const [showLogin, setShowLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const isAdmin = !!token;

  // ---- Playlists (admin) ----
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [savedPlaylists, setSavedPlaylists] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cm_playlists") || "[]");
    } catch {
      return [];
    }
  });
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);

  // Conexión en tiempo real con el backend
  useEffect(() => {
    let alive = true;
    function connect() {
      const ws = new WebSocket(API_URL.replace(/^http/, "ws"));
      wsRef.current = ws;
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "state") {
          setQueue(data.queue || []);
          setNowPlaying(data.nowPlaying || null);
          setPaused(!!data.paused);
          if (typeof data.volume === "number") setVolume(data.volume);
        }
      };
      ws.onclose = () => {
        if (alive) setTimeout(connect, 2000);
      };
    }
    connect();
    return () => {
      alive = false;
      wsRef.current?.close();
    };
  }, []);

  // Verificar token guardado al cargar
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/verify`, { headers: { "x-admin-token": token } })
      .then((r) => r.json())
      .then((d) => {
        if (!d.valid) {
          setToken("");
          localStorage.removeItem("cm_admin_token");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem("cm_name", name);
  }, [name]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  async function buscar(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const r = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
      const data = await r.json();
      if (data.error) setError(data.error);
      else setResults(data.items || []);
    } catch {
      setError("No se pudo conectar con la taberna (backend). ¿Está encendido?");
    }
    setLoading(false);
  }

  async function agregar(song) {
    try {
      const r = await fetch(`${API_URL}/api/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...song, addedBy: name || "Trovador anónimo" }),
      });
      if (r.ok) showToast(`«${song.title.slice(0, 40)}» enviada a la cola 🎵`);
    } catch {
      showToast("No se pudo enviar la canción.");
    }
  }

  /* ---- Login / logout ---- */
  async function doLogin() {
    setLoginError("");
    try {
      const r = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: loginUser, pass: loginPass }),
      });
      const d = await r.json();
      if (r.ok && d.token) {
        setToken(d.token);
        localStorage.setItem("cm_admin_token", d.token);
        setShowLogin(false);
        setLoginUser("");
        setLoginPass("");
        showToast("Sesión de tabernero iniciada 👑");
      } else {
        setLoginError(d.error || "No se pudo iniciar sesión.");
      }
    } catch {
      setLoginError("No se pudo conectar con el servidor.");
    }
  }

  async function doLogout() {
    try {
      await fetch(`${API_URL}/api/logout`, {
        method: "POST",
        headers: { "x-admin-token": token },
      });
    } catch {}
    setToken("");
    localStorage.removeItem("cm_admin_token");
    showToast("Sesión cerrada");
  }

  /* ---- Acciones de admin (mandan el token) ---- */
  async function adminAction(path, method = "POST") {
    try {
      await fetch(`${API_URL}${path}`, {
        method,
        headers: { "x-admin-token": token },
      });
    } catch {}
  }
  const skip = () => adminAction("/api/skip");
  const togglePause = () => adminAction("/api/toggle-pause");
  const borrar = (id) => adminAction(`/api/queue/${id}`, "DELETE");

  // ---- Limpiar toda la cola (con confirmación) ----
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function limpiarCola() {
    adminAction("/api/clear");
    setShowClearConfirm(false);
    showToast("Cola vaciada");
  }

  // ---- Reordenar la cola (arrastrar y soltar) ----
  // Orden local mientras se arrastra (para respuesta visual inmediata)
  const [localOrder, setLocalOrder] = useState(null); // null = usar la cola del backend
  const dragId = useRef(null);
  const dragOverId = useRef(null);

  // La lista que se muestra: si estamos arrastrando, el orden local; si no, la cola real
  const displayQueue = localOrder || queue;

  function enviarOrden(items) {
    fetch(`${API_URL}/api/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ order: items.map((s) => s.id) }),
    }).catch(() => {});
  }

  function onDragStart(id) {
    dragId.current = id;
    setLocalOrder([...queue]);
  }
  function onDragEnter(id) {
    dragOverId.current = id;
    if (!localOrder || dragId.current === id) return;
    const items = [...localOrder];
    const from = items.findIndex((s) => s.id === dragId.current);
    const to = items.findIndex((s) => s.id === id);
    if (from === -1 || to === -1) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    setLocalOrder(items);
  }
  function onDragEnd() {
    if (localOrder) {
      enviarOrden(localOrder);
      showToast("Cola reordenada");
    }
    dragId.current = null;
    dragOverId.current = null;
    setLocalOrder(null);
  }

  // --- Soporte táctil (móvil): mover con el dedo ---
  function onTouchStart(id) {
    dragId.current = id;
    setLocalOrder([...queue]);
  }
  function onTouchMove(e) {
    if (!dragId.current) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const li = el?.closest("[data-qid]");
    if (li) {
      const overId = li.getAttribute("data-qid");
      if (overId && overId !== dragId.current) onDragEnter(overId);
    }
  }
  function onTouchEnd() {
    onDragEnd();
  }

  /* ---- Volumen ---- */
  // Enviar el volumen al backend (con throttle simple)
  const volTimerRef = useRef(null);
  function enviarVolumen(v) {
    if (volTimerRef.current) clearTimeout(volTimerRef.current);
    volTimerRef.current = setTimeout(() => {
      fetch(`${API_URL}/api/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ volume: v }),
      }).catch(() => {});
    }, 120);
  }
  function onVolumeChange(v) {
    setVolume(v); // respuesta visual inmediata
    enviarVolumen(v);
  }

  /* ---- Playlists ---- */
  function persistPlaylists(list) {
    setSavedPlaylists(list);
    localStorage.setItem("cm_playlists", JSON.stringify(list));
  }

  // Cargar una playlist (por URL) al backend → se añade a la cola de todos
  async function cargarPlaylist(url) {
    if (!url?.trim()) return;
    setLoadingPlaylist(true);
    try {
      const r = await fetch(`${API_URL}/api/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ url, addedBy: name || "Tabernero" }),
      });
      const d = await r.json();
      if (r.ok) showToast(`Playlist cargada: ${d.added} canciones a la cola 🎶`);
      else showToast(d.error || "No se pudo cargar la playlist.");
    } catch {
      showToast("No se pudo conectar para cargar la playlist.");
    }
    setLoadingPlaylist(false);
  }

  // Guardar la playlist actual en localStorage (para reproducir después)
  function guardarPlaylist() {
    if (!playlistUrl.trim()) return;
    const nueva = {
      id: Date.now().toString(36),
      name: playlistName.trim() || "Playlist sin nombre",
      url: playlistUrl.trim(),
    };
    persistPlaylists([nueva, ...savedPlaylists]);
    setPlaylistName("");
    showToast("Playlist guardada 📜");
  }

  function borrarPlaylistGuardada(id) {
    persistPlaylists(savedPlaylists.filter((p) => p.id !== id));
  }

  return (
    <div className="page">
      <div className="vignette" />
      <header className="hero">
        <div className="crest">⚜</div>
        <h1 className="title">Café Medieval</h1>
        <p className="subtitle">Pedid vuestra canción, juglar</p>
        <div className="rule">
          <span>♪</span>
        </div>
      </header>

      {nowPlaying && (
        <div className="nowbar">
          <span className="nowbar-label">
            Sonando en la taberna {paused && "· ⏸ en pausa"}
          </span>
          <span className="nowbar-title">♫ {nowPlaying.title}</span>
        </div>
      )}

      {/* Panel de tabernero (solo admin) */}
      {isAdmin && (
        <div className="admin-panel">
          <div className="admin-panel-head">
            <span>👑 Tabernero</span>
            <button className="admin-logout" onClick={doLogout}>Salir</button>
          </div>
          <div className="admin-buttons">
            <button
              className="abtn abtn-pause"
              onClick={togglePause}
              disabled={!nowPlaying}
            >
              {paused ? "▶ Reanudar" : "⏸ Pausar"}
            </button>
            <button
              className="abtn abtn-skip"
              onClick={skip}
              disabled={!nowPlaying}
            >
              ⏭ Saltar
            </button>
          </div>

          {/* Control de volumen */}
          <div className="vol-control">
            <span className="vol-icon">{volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}</span>
            <input
              type="range"
              className="vol-slider"
              min="0"
              max="100"
              value={volume}
              style={{ "--fill": `${volume}%` }}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
            />
            <span className="vol-value">{volume}</span>
          </div>

          {/* Playlists */}
          <div className="pl-section">
            <div className="pl-title">🎶 Cargar playlist de YouTube</div>
            <input
              className="pl-input"
              placeholder="Pega el link de la playlist…"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
            />
            <div className="pl-row">
              <input
                className="pl-input pl-name"
                placeholder="Nombre (para guardar)"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
              />
              <button className="pl-save" onClick={guardarPlaylist} title="Guardar para después">
                📜
              </button>
            </div>
            <button
              className="pl-load"
              onClick={() => cargarPlaylist(playlistUrl)}
              disabled={loadingPlaylist || !playlistUrl.trim()}
            >
              {loadingPlaylist ? "Cargando…" : "+ Añadir playlist a la cola"}
            </button>

            {savedPlaylists.length > 0 && (
              <div className="pl-saved">
                <div className="pl-saved-head">Guardadas</div>
                {savedPlaylists.map((p) => (
                  <div className="pl-saved-item" key={p.id}>
                    <span className="pl-saved-name" title={p.url}>{p.name}</span>
                    <button
                      className="pl-saved-play"
                      onClick={() => cargarPlaylist(p.url)}
                      disabled={loadingPlaylist}
                    >
                      ▶
                    </button>
                    <button
                      className="pl-saved-del"
                      onClick={() => borrarPlaylistGuardada(p.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="scroll">
        <label className="field">
          <span className="field-label">Vuestro nombre</span>
          <input
            className="input name-input"
            placeholder="p. ej. Sir Lancelot"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
          />
        </label>

        <form className="searchbox" onSubmit={buscar}>
          <input
            className="input"
            placeholder="Buscad una canción o trova…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-search" type="submit" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        <div className="results">
          {results.map((song) => (
            <div className="card" key={song.videoId}>
              <div
                className="thumb"
                style={{ backgroundImage: `url(${song.thumbnail})` }}
              />
              <div className="card-body">
                <div className="card-title">{song.title}</div>
                <div className="card-channel">{song.channel}</div>
              </div>
              <button className="btn-add" onClick={() => agregar(song)}>
                + Pedir
              </button>
            </div>
          ))}
          {!loading && results.length === 0 && !error && (
            <div className="empty">
              <div className="empty-icon">🎻</div>
              <p>Buscad arriba para encontrar vuestra melodía.</p>
            </div>
          )}
        </div>

        {queue.length > 0 && isAdmin && (
          <section className="queue">
            <div className="queue-head-row">
              <h2 className="queue-title">En la cola del bardo · {queue.length}</h2>
              <button className="queue-clear" onClick={() => setShowClearConfirm(true)}>
                🗑 Vaciar
              </button>
            </div>
            <p className="queue-hint">Arrastra para reordenar ✥</p>
            <ol className="queue-list">
              {displayQueue.map((s, i) => (
                <li
                  key={s.id}
                  data-qid={s.id}
                  className={`queue-item draggable ${dragId.current === s.id ? "dragging" : ""}`}
                  draggable
                  onDragStart={() => onDragStart(s.id)}
                  onDragEnter={() => onDragEnter(s.id)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <span
                    className="drag-grip"
                    title="Arrastrar"
                    onTouchStart={() => onTouchStart(s.id)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    style={{ touchAction: "none" }}
                  >⋮⋮</span>
                  <span className="queue-num">{i + 1}</span>
                  <div className="queue-info">
                    <span className="queue-song">{s.title}</span>
                    <span className="queue-by">pedida por {s.addedBy}</span>
                  </div>
                  <button
                    className="queue-del"
                    title="Borrar de la cola"
                    onClick={() => borrar(s.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {queue.length > 0 && !isAdmin && (() => {
          const PER_PAGE = 10;
          const totalPages = Math.ceil(queue.length / PER_PAGE);
          const page = Math.min(queuePage, totalPages - 1);
          const start = page * PER_PAGE;
          const visibles = queue.slice(start, start + PER_PAGE);
          return (
            <section className="queue">
              <h2 className="queue-title">En la cola del bardo · {queue.length}</h2>
              <ol className="queue-list">
                {visibles.map((s, i) => (
                  <li key={s.id} className="queue-item">
                    <span className="queue-num">{start + i + 1}</span>
                    <div className="queue-info">
                      <span className="queue-song">{s.title}</span>
                      <span className="queue-by">pedida por {s.addedBy}</span>
                    </div>
                  </li>
                ))}
              </ol>

              {totalPages > 1 && (
                <div className="pager">
                  <button
                    className="pager-btn"
                    onClick={() => setQueuePage(Math.max(0, page - 1))}
                    disabled={page === 0}
                  >
                    ‹ Anterior
                  </button>
                  <span className="pager-info">
                    Página {page + 1} de {totalPages}
                  </span>
                  <button
                    className="pager-btn"
                    onClick={() => setQueuePage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Siguiente ›
                  </button>
                </div>
              )}
            </section>
          );
        })()}
      </main>

      {/* Acceso / estado de tabernero al pie */}
      {!isAdmin && (
        <button className="admin-access" onClick={() => setShowLogin(true)}>
          🔑 Acceso tabernero
        </button>
      )}

      {toast && <div className="toast">{toast}</div>}

      {/* Confirmación de vaciar cola */}
      {showClearConfirm && (
        <div className="login-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">🗑</div>
            <h2 className="confirm-title">¿Vaciar toda la cola?</h2>
            <p className="confirm-text">
              Se quitarán las {queue.length} canciones en espera. La que está
              sonando no se ve afectada. Esta acción no se puede deshacer.
            </p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setShowClearConfirm(false)}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={limpiarCola}>
                Sí, vaciar
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="foot">⚔ Café Medieval · Taberna del Trovador ⚔</footer>

      {/* Modal de login */}
      {showLogin && (
        <div className="login-overlay" onClick={() => setShowLogin(false)}>
          <div className="login-box" onClick={(e) => e.stopPropagation()}>
            <div className="login-crest">⚜</div>
            <h2 className="login-title">Acceso del Tabernero</h2>
            <input
              className="login-input"
              placeholder="Usuario"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doLogin()}
            />
            <input
              className="login-input"
              type="password"
              placeholder="Contraseña"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doLogin()}
            />
            {loginError && <div className="login-error">{loginError}</div>}
            <div className="login-actions">
              <button className="btn-cancel" onClick={() => setShowLogin(false)}>
                Cancelar
              </button>
              <button className="btn-enter" onClick={doLogin}>
                Entrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

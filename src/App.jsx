import { useEffect, useRef, useState } from "react";
import { API_URL } from "./config";

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("cm_name") || "");
  const [queue, setQueue] = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState("");
  const wsRef = useRef(null);

  // ---- Sesión de administrador ----
  const [token, setToken] = useState(() => localStorage.getItem("cm_admin_token") || "");
  const [showLogin, setShowLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const isAdmin = !!token;

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

        {queue.length > 0 && (
          <section className="queue">
            <h2 className="queue-title">En la cola del bardo · {queue.length}</h2>
            <ol className="queue-list">
              {queue.map((s, i) => (
                <li key={s.id} className="queue-item">
                  <span className="queue-num">{i + 1}</span>
                  <div className="queue-info">
                    <span className="queue-song">{s.title}</span>
                    <span className="queue-by">pedida por {s.addedBy}</span>
                  </div>
                  {isAdmin && (
                    <button
                      className="queue-del"
                      title="Borrar de la cola"
                      onClick={() => borrar(s.id)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      {/* Acceso / estado de tabernero al pie */}
      {!isAdmin && (
        <button className="admin-access" onClick={() => setShowLogin(true)}>
          🔑 Acceso tabernero
        </button>
      )}

      {toast && <div className="toast">{toast}</div>}

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

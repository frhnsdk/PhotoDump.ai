/**
 * api.js — Central API helper for PhotoDump
 * Handles JWT auth tokens, dump access tokens, and fetch wrappers.
 */
const API = (() => {
  const BASE = "";  // same origin

  // ── Token storage ──────────────────────────────────────────────────────────
  const getToken = () => localStorage.getItem("pd_token");
  const setToken = (t) => localStorage.setItem("pd_token", t);
  const getUser  = () => {
    try { return JSON.parse(localStorage.getItem("pd_user")); } catch { return null; }
  };
  const setUser  = (u) => localStorage.setItem("pd_user", JSON.stringify(u));

  // Dump tokens: keyed by dump name  →  { token, expires }
  const setDumpToken = (dumpName, token) => {
    const key = `pd_dt_${dumpName}`;
    localStorage.setItem(key, token);
  };
  const getDumpToken = (dumpName) => {
    return localStorage.getItem(`pd_dt_${dumpName}`) || null;
  };

  const logout = () => {
    localStorage.removeItem("pd_token");
    localStorage.removeItem("pd_user");
    window.location.href = "/login";
  };

  // ── Fetch helpers ─────────────────────────────────────────────────────────
  const _headers = (extra = {}) => {
    const h = { "Content-Type": "application/json", ...extra };
    const t = getToken();
    if (t) h["Authorization"] = `Bearer ${t}`;
    return h;
  };

  const _headersWithDump = (dumpName, extra = {}) => {
    const h = _headers(extra);
    const dt = getDumpToken(dumpName);
    if (dt) h["X-Dump-Token"] = dt;
    return h;
  };

  const _check = async (res) => {
    if (res.ok) return res.status === 204 ? {} : res.json();
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (Array.isArray(body.detail)) {
        msg = body.detail.map(d => d.msg || JSON.stringify(d)).join("; ");
      } else {
        msg = body.detail || body.message || JSON.stringify(body);
      }
    } catch {}
    if (res.status === 401) {
      localStorage.removeItem("pd_token");
    }
    throw new Error(msg);
  };

  const get = (path, dumpName = null) =>
    fetch(BASE + path, { headers: dumpName ? _headersWithDump(dumpName) : _headers() }).then(_check);

  const post = (path, body, dumpName = null) =>
    fetch(BASE + path, {
      method: "POST",
      headers: dumpName ? _headersWithDump(dumpName) : _headers(),
      body: JSON.stringify(body),
    }).then(_check);

  const patch = (path, body, dumpName = null) =>
    fetch(BASE + path, {
      method: "PATCH",
      headers: dumpName ? _headersWithDump(dumpName) : _headers(),
      body: JSON.stringify(body),
    }).then(_check);

  const del = (path, dumpName = null) =>
    fetch(BASE + path, {
      method: "DELETE",
      headers: dumpName ? _headersWithDump(dumpName) : _headers(),
    }).then(_check);

  // ── File upload (FormData) ─────────────────────────────────────────────────
  const uploadFiles = (path, formData, dumpName = null, onProgress = null) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", BASE + path);
      const t = getToken();
      if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
      const dt = dumpName ? getDumpToken(dumpName) : null;
      if (dt) xhr.setRequestHeader("X-Dump-Token", dt);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
        } else {
          let msg = `HTTP ${xhr.status}`;
          try { msg = JSON.parse(xhr.responseText).detail || msg; } catch {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(formData);
    });
  };

  // ── Utility ────────────────────────────────────────────────────────────────
  const formatBytes = (b) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    return new Date(iso + (iso.endsWith("Z") ? "" : "Z")).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  };

  const requireAuth = () => {
    if (!getToken()) {
      window.location.href = "/login";
      return false;
    }
    return true;
  };

  // ── Auth-aware image loader ────────────────────────────────────────────────
  // Fetches an image with auth headers and sets the imgEl src to a blob URL.
  const loadAuthImage = async (imgEl, url, dumpName = null) => {
    imgEl.classList.add("img-loading");
    try {
      const h = {};
      const t = getToken();
      if (t) h["Authorization"] = `Bearer ${t}`;
      const dt = dumpName ? getDumpToken(dumpName) : null;
      if (dt) h["X-Dump-Token"] = dt;
      const res = await fetch(url, { headers: h });
      if (!res.ok) { imgEl.classList.remove("img-loading"); imgEl.classList.add("img-error"); return; }
      const blob = await res.blob();
      imgEl.src = URL.createObjectURL(blob);
      imgEl.classList.remove("img-loading");
    } catch {
      imgEl.classList.remove("img-loading");
      imgEl.classList.add("img-error");
    }
  };

  // ── Toast notifications ───────────────────────────────────────────────────
  const showToast = (msg, type = "info", duration = 3500) => {
    let container = document.getElementById("_pd_toasts");
    if (!container) {
      container = document.createElement("div");
      container.id = "_pd_toasts";
      container.style.cssText =
        "position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;" +
        "display:flex;flex-direction:column;gap:.5rem;max-width:360px;pointer-events:none;";
      document.body.appendChild(container);
    }
    const colors = { info: "#7c6ff7", success: "#22c55e", error: "#ef4444", warn: "#f59e0b" };
    const c = colors[type] || colors.info;
    const toast = document.createElement("div");
    toast.style.cssText =
      `background:#141720;border:1px solid ${c};border-left:3px solid ${c};` +
      `color:#e8eaf0;padding:.75rem 1rem;border-radius:8px;font-size:.88rem;` +
      `box-shadow:0 4px 16px rgba(0,0,0,.5);pointer-events:auto;` +
      `animation:pdFadeIn .2s ease;`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = "opacity .3s, transform .3s";
      toast.style.opacity = "0";
      toast.style.transform = "translateX(12px)";
      setTimeout(() => toast.remove(), 320);
    }, duration);
  };

  // ── Confirm dialog (promise-based) ────────────────────────────────────────
  const showConfirm = (msg, opts = {}) => {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);" +
        "display:flex;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(2px);";
      const btnColor = opts.danger ? "#ef4444" : "#7c6ff7";
      const safeMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      overlay.innerHTML = `
        <div style="background:#141720;border:1px solid #2a2f40;border-radius:12px;
          padding:2rem;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.6);">
          <p style="color:#e8eaf0;font-size:.95rem;line-height:1.6;margin-bottom:1.5rem;">${safeMsg}</p>
          <div style="display:flex;gap:.75rem;justify-content:flex-end;">
            <button id="_pd_cc" style="background:transparent;border:1.5px solid #2a2f40;
              color:#8b92a8;padding:.5rem 1.2rem;border-radius:8px;font-size:.9rem;cursor:pointer;">
              ${opts.cancelText || "Cancel"}</button>
            <button id="_pd_co" style="background:${btnColor};border:none;color:#fff;
              padding:.5rem 1.4rem;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;">
              ${opts.confirmText || "Confirm"}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("#_pd_co").onclick = () => { overlay.remove(); resolve(true); };
      overlay.querySelector("#_pd_cc").onclick = () => { overlay.remove(); resolve(false); };
      overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
    });
  };

  return {
    getToken, setToken, getUser, setUser, logout,
    setDumpToken, getDumpToken,
    get, post, patch, del, uploadFiles,
    formatBytes, formatDate, requireAuth,
    loadAuthImage, showToast, showConfirm,
  };
})();

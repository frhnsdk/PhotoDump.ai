// view-dump.js — Guest view (browse + download + contribute)
(async () => {
  const params = new URLSearchParams(location.search);
  const DUMP_NAME = params.get("dump");
  if (!DUMP_NAME) { window.location.href = "/access-dump"; return; }

  // Check we have a dump token (or user is owner)
  const dumpToken = API.getDumpToken(DUMP_NAME);
  const userToken = API.getToken();
  if (!dumpToken && !userToken) {
    window.location.href = `/access-dump?dump=${encodeURIComponent(DUMP_NAME)}`;
    return;
  }

  let photos = [];
  let contribFiles = [];
  let lbIndex = 0;

  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ── Nav ───────────────────────────────────────────────────────────────────
  const user = API.getUser();
  if (user) {
    document.getElementById("navActions").innerHTML = `
      <span class="nav-user">👋 ${user.username}</span>
      <a class="btn btn-ghost" href="/dashboard">Dashboard</a>
      <a class="btn btn-ghost" href="/access-dump"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78z"/><path d="M11 6V2"/><path d="M22 11h-4"/></svg>Access Another</a>
    `;
  }

  // ── Load dump info ────────────────────────────────────────────────────────
  async function loadDump() {
    try {
      const d = await API.get(`/api/dumps/${encodeURIComponent(DUMP_NAME)}`, DUMP_NAME);
      document.title = `${d.name} – PhotoDump`;
      document.getElementById("dumpTitle").textContent = d.name;
      document.getElementById("dumpMeta").textContent =
        `${d.photo_count} photo${d.photo_count !== 1 ? "s" : ""}  ·  ${API.formatBytes(d.total_size)}  ·  by ${d.owner_username}`;

      // Apply background color to gallery only
      if (d.background_color && d.background_color !== '#0d0f14') {
        const grid = document.getElementById('galleryGrid');
        grid.style.backgroundColor = d.background_color;
        grid.style.padding = '12px';
        grid.style.borderRadius = 'var(--radius)';
      }

      const expBadge = document.getElementById("dumpExpiry");
      if (d.expires_at) {
        const daysLeft = Math.ceil((new Date(d.expires_at + "Z") - Date.now()) / 86400000);
        expBadge.textContent = daysLeft > 0 ? `Expires in ${daysLeft}d` : "Expired";
        expBadge.className = `badge ${daysLeft <= 7 ? "badge-warn" : ""}`;
      } else {
        expBadge.textContent = "Unlimited ♾️";
        expBadge.className = "badge badge-success";
      }
    } catch (err) {
      API.showToast("Cannot load dump. You may need to re-enter the password.", "error");
      window.location.href = `/access-dump?dump=${encodeURIComponent(DUMP_NAME)}`;
    }
  }

  // ── Load photos ───────────────────────────────────────────────────────────
  async function loadPhotos() {
    try {
      photos = await API.get(`/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos`, DUMP_NAME);
    } catch { photos = []; }
    renderGallery();
  }

  function renderGallery() {
    const grid = document.getElementById("galleryGrid");
    const empty = document.getElementById("galleryEmpty");
    document.getElementById("galleryCount").textContent = photos.length;
    grid.innerHTML = "";
    if (!photos.length) { empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden");
    photos.forEach((p, i) => {
      const div = document.createElement("div");
      div.className = "photo-item";
      // Use full image for Pinterest masonry (natural aspect ratio)
      const thumbUrl = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${p.id}/file`;
      div.innerHTML = `
        <div class="photo-check">
          <input type="checkbox" data-id="${p.id}" onchange="updateDownloadBtn()" />
        </div>
        <img alt="${escHtml(p.original_name)}" />
        <div class="photo-overlay">
          <div class="photo-item-actions">
            <button onclick="openLightbox(${i})" title="View">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button onclick="dlOne(${p.id})" title="Download">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>
            </button>
          </div>
        </div>
        <div class="photo-info-bar">
          ${escHtml(p.original_name)}${p.uploader_name ? ` · ${escHtml(p.uploader_name)}` : ""}
        </div>
      `;
      const img = div.querySelector("img");
      API.loadAuthImage(img, thumbUrl, DUMP_NAME);
      grid.appendChild(div);
    });
  }

  // ── Download helpers ───────────────────────────────────────────────────────
  window.dlOne = (id) => {
    const a = document.createElement("a");
    a.href = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${id}/download`;
    if (dumpToken) a.href += `?_dt=${encodeURIComponent(dumpToken)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  window.updateDownloadBtn = () => {
    const sel = [...document.querySelectorAll("#galleryGrid input[type=checkbox]:checked")];
    document.getElementById("downloadSelBtn").disabled = sel.length === 0;
  };

  window.toggleSelectAll = (cb) => {
    document.querySelectorAll("#galleryGrid input[type=checkbox]").forEach(c => c.checked = cb.checked);
    updateDownloadBtn();
  };

  window.downloadSelected = () => {
    const ids = [...document.querySelectorAll("#galleryGrid input[type=checkbox]:checked")].map(c => c.dataset.id);
    if (!ids.length) return;
    downloadZip(ids.join(","));
  };

  window.downloadAll = () => downloadZip(null);

  function downloadZip(ids) {
    let url = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/download-all`;
    const qs = new URLSearchParams();
    if (ids) qs.set("ids", ids);
    const urlStr = ids ? `${url}?${qs}` : url;
    // Use fetch + blob to pass headers
    const headers = {};
    const t = API.getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
    const dt = API.getDumpToken(DUMP_NAME);
    if (dt) headers["X-Dump-Token"] = dt;
    fetch(urlStr, { headers })
      .then(res => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${DUMP_NAME}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(e => API.showToast("Download failed: " + e.message, "error"));
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────
  window.openLightbox = (idx) => {
    lbIndex = idx;
    showLb();
  };
  const showLb = () => {
    const p = photos[lbIndex];
    if (!p) return;
    const lbImg = document.getElementById("lbImg");
    lbImg.src = "";
    API.loadAuthImage(lbImg, `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${p.id}/file`, DUMP_NAME);
    document.getElementById("lbCaption").textContent =
      `${p.original_name}  ·  ${API.formatBytes(p.file_size)}${p.uploader_name ? `  ·  by ${p.uploader_name}` : ""}`;
    document.getElementById("lightbox").classList.add("open");
  };
  window.closeLightbox = () => document.getElementById("lightbox").classList.remove("open");
  window.lbNav = (dir, e) => {
    e.stopPropagation();
    lbIndex = (lbIndex + dir + photos.length) % photos.length;
    showLb();
  };
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("lightbox").classList.contains("open")) return;
    if (e.key === "ArrowLeft")  { lbIndex = (lbIndex - 1 + photos.length) % photos.length; showLb(); }
    if (e.key === "ArrowRight") { lbIndex = (lbIndex + 1) % photos.length; showLb(); }
    if (e.key === "Escape") closeLightbox();
  });

  // ── Tabs ──────────────────────────────────────────────────────────────────
  window.switchTab = (name, btn) => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${name}`).classList.add("active");
  };

  // ── Contributor upload ────────────────────────────────────────────────────
  const cdropzone = document.getElementById("contribDropzone");
  const cFileInput = document.getElementById("contribFileInput");

  cdropzone.addEventListener("dragover", (e) => { e.preventDefault(); cdropzone.classList.add("drag-over"); });
  cdropzone.addEventListener("dragleave", () => cdropzone.classList.remove("drag-over"));
  cdropzone.addEventListener("drop", (e) => {
    e.preventDefault(); cdropzone.classList.remove("drag-over");
    addContribFiles([...e.dataTransfer.files]);
  });
  cFileInput.addEventListener("change", () => {
    addContribFiles([...cFileInput.files]);
    cFileInput.value = "";
  });

  function addContribFiles(files) {
    const images = files.filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif)$/i.test(f.name));
    contribFiles.push(...images);
    renderContribQueue();
  }

  function renderContribQueue() {
    const queueEl = document.getElementById("contribQueue");
    const listEl = document.getElementById("contribQueueList");
    const titleEl = document.getElementById("contribQueueTitle");

    // Revoke previous object URLs to free memory
    if (queueEl._objUrls) queueEl._objUrls.forEach(URL.revokeObjectURL);
    queueEl._objUrls = [];

    if (!contribFiles.length) { queueEl.classList.add("hidden"); return; }
    queueEl.classList.remove("hidden");
    titleEl.textContent = `${contribFiles.length} file${contribFiles.length !== 1 ? "s" : ""} ready to submit`;
    listEl.innerHTML = "";
    contribFiles.forEach((f, i) => {
      const objUrl = URL.createObjectURL(f);
      queueEl._objUrls.push(objUrl);
      const item = document.createElement("div");
      item.className = "queue-item";
      item.innerHTML = `
        <img class="qi-thumb" src="${objUrl}" alt="" />
        <span class="qi-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
        <span class="qi-size">${API.formatBytes(f.size)}</span>
        <span class="qi-status pending" id="cqs-${i}">Ready</span>
        <button class="qi-remove" onclick="removeContribFile(${i})" title="Remove">×</button>
      `;
      listEl.appendChild(item);
    });
  }

  window.removeContribFile = (i) => {
    contribFiles.splice(i, 1);
    renderContribQueue();
  };

  window.submitContribution = async () => {
    const name = document.getElementById("contributorName").value.trim();
    if (!name) { API.showToast("Please enter your name before submitting.", "warn"); return; }
    if (!contribFiles.length) return;

    const successEl = document.getElementById("contribSuccess");
    successEl.classList.add("hidden");

    const BATCH = 10;
    for (let i = 0; i < contribFiles.length; i += BATCH) {
      const batch = contribFiles.slice(i, i + BATCH);
      const fd = new FormData();
      batch.forEach(f => fd.append("files", f));
      fd.append("uploader_name", name);
      fd.append("is_contributor", "true");
      batch.forEach((_, j) => {
        const s = document.getElementById(`cqs-${i + j}`);
        if (s) { s.textContent = "Uploading…"; s.className = "qi-status uploading"; }
      });
      try {
        await API.uploadFiles(
          `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos`,
          fd, DUMP_NAME
        );
        batch.forEach((_, j) => {
          const s = document.getElementById(`cqs-${i + j}`);
          if (s) { s.textContent = "\u2713 Sent"; s.className = "qi-status done"; }
        });
      } catch (err) {
        batch.forEach((_, j) => {
          const s = document.getElementById(`cqs-${i + j}`);
          if (s) { s.textContent = "\u2717 Error"; s.className = "qi-status error"; }
        });
        API.showToast("Upload failed: " + err.message, "error");
      }
    }
    successEl.classList.remove("hidden");
    contribFiles = [];
    setTimeout(() => { document.getElementById("contribQueue").classList.add("hidden"); }, 2000);
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  await loadDump();
  await loadPhotos();
})();

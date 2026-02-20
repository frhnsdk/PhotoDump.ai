// manage-dump.js — Owner management view
(async () => {
  if (!API.requireAuth()) return;

  const params = new URLSearchParams(location.search);
  const DUMP_NAME = params.get("dump");
  if (!DUMP_NAME) { window.location.href = "/dashboard"; return; }

  let dumpInfo = null;
  let allPhotos = [];
  let pendingPhotos = [];
  let queueFiles = [];
  let lbIndex = 0;
  let lbMode = "gallery"; // "gallery" | "pending"

  // ── Helpers ──────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ── Load dump info ────────────────────────────────────────────────────────
  async function loadDump() {
    try {
      dumpInfo = await API.get(`/api/dumps/${encodeURIComponent(DUMP_NAME)}`);
      document.title = `${dumpInfo.name} – PhotoDump`;
      document.getElementById("dumpTitle").textContent = dumpInfo.name;

      if (dumpInfo.description) {
        document.querySelector(".dump-title-block").insertAdjacentHTML(
          "beforeend", `<p style="color:var(--text2);font-size:.9rem;margin-top:.4rem">${escHtml(dumpInfo.description)}</p>`
        );
      }

      // Expiry badge
      const expBadge = document.getElementById("dumpExpiry");
      if (dumpInfo.expires_at) {
        const daysLeft = Math.ceil((new Date(dumpInfo.expires_at+"Z") - Date.now()) / 86400000);
        expBadge.textContent = daysLeft > 0 ? `Expires in ${daysLeft}d` : "Expired";
        expBadge.className = `badge ${daysLeft <= 7 ? "badge-warn" : ""}`;
      } else {
        expBadge.textContent = "Unlimited ♾️";
        expBadge.className = "badge badge-success";
      }

      // Apply background color to gallery only
      if (dumpInfo.background_color && dumpInfo.background_color !== '#0d0f14') {
        const grid = document.getElementById('galleryGrid');
        grid.style.backgroundColor = dumpInfo.background_color;
        grid.style.padding = '12px';
        grid.style.borderRadius = 'var(--radius)';
      }

      // Share banner
      document.getElementById("shareLine").textContent =
        ` Name: "${dumpInfo.name}"  ·  URL: ${location.origin}/access-dump?dump=${encodeURIComponent(dumpInfo.name)}`;
    } catch (err) {
      API.showToast("Error loading dump: " + err.message, "error");
      window.location.href = "/dashboard";
    }
  }

  // ── Load photos ───────────────────────────────────────────────────────────
  async function loadPhotos() {
    try {
      allPhotos = await API.get(`/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos?include_pending=false`);
      pendingPhotos = (
        await API.get(`/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos?include_pending=true`)
      ).filter((p) => !p.is_approved);
    } catch (e) {
      allPhotos = [];
      pendingPhotos = [];
    }
    renderGallery();
    renderPending();
    updateCounts();
  }

  function updateCounts() {
    document.getElementById("galleryCount").textContent = allPhotos.length;
    const pc = document.getElementById("pendingCount");
    pc.textContent = pendingPhotos.length;
    pc.style.display = pendingPhotos.length > 0 ? "" : "none";
  }

  // ── Gallery ───────────────────────────────────────────────────────────────
  function renderGallery() {
    const grid = document.getElementById("galleryGrid");
    const empty = document.getElementById("galleryEmpty");
    grid.innerHTML = "";
    if (allPhotos.length === 0) { empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden");
    allPhotos.forEach((p, i) => {
      grid.appendChild(makePhotoItem(p, i, true));
    });
  }

  function makePhotoItem(photo, idx, isOwner) {
    const div = document.createElement("div");
    div.className = "photo-item";
    div.dataset.id = photo.id;

    const thumbUrl = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${photo.id}/file`;

    const deleteBtn = isOwner
      ? `<button onclick="deletePhoto(${photo.id})" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>`
      : "";
    const contribBadge = photo.is_contributor
      ? `<span class="photo-contributor-badge">contributor</span>`
      : "";

    div.innerHTML = `
      <div class="photo-check">
        <input type="checkbox" data-id="${photo.id}" />
      </div>
      <img alt="${escHtml(photo.original_name)}" />
      <div class="photo-overlay">
        <div class="photo-item-actions">
          <button onclick="openLightbox(${idx})" title="View">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button onclick="downloadOne(${photo.id})" title="Download">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>
          </button>
          ${deleteBtn}
        </div>
      </div>
      ${contribBadge}
    `;
    API.loadAuthImage(div.querySelector("img"), thumbUrl, DUMP_NAME);
    return div;
  }

  // ── Pending photos ────────────────────────────────────────────────────────
  function renderPending() {
    const grid = document.getElementById("pendingGrid");
    const empty = document.getElementById("pendingEmpty");
    grid.innerHTML = "";
    if (pendingPhotos.length === 0) { empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden");
    pendingPhotos.forEach((p, pIdx) => {
      const div = document.createElement("div");
      div.className = "photo-item";
      div.dataset.id = p.id;
      const thumbUrl = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${p.id}/thumb`;
      div.innerHTML = `<img alt="${escHtml(p.original_name)}" />`;
      API.loadAuthImage(div.querySelector("img"), thumbUrl, DUMP_NAME);

      const uploaderName = escHtml(p.uploader_name || "Unknown");
      const pid = Number(p.id);
      const badge = document.createElement("div");
      badge.className = "photo-contributor-badge";
      badge.textContent = "pending";
      const overlay = document.createElement("div");
      overlay.className = "photo-overlay";
      overlay.style.cssText = "opacity:1;flex-direction:column;align-items:center;justify-content:flex-end;gap:.4rem";
      const nameEl = document.createElement("span");
      nameEl.style.cssText = "font-size:.75rem;color:#fff";
      nameEl.innerHTML = uploaderName;
      const approveBar = document.createElement("div");
      approveBar.className = "pending-approve-bar";
      const svgZoom = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
      const svgChk  = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      const svgX    = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      const vBtn = document.createElement("button");
      vBtn.className = "btn-view-pending"; vBtn.title = "View full size";
      vBtn.setAttribute("onclick", "openPendingLightbox(" + pIdx + ")");
      vBtn.innerHTML = svgZoom + " View";
      const aBtn = document.createElement("button");
      aBtn.className = "btn-approve"; aBtn.title = "Approve";
      aBtn.setAttribute("onclick", "approvePhoto(" + pid + ", true)");
      aBtn.innerHTML = svgChk + " Approve";
      const rBtn = document.createElement("button");
      rBtn.className = "btn-reject"; rBtn.title = "Reject";
      rBtn.setAttribute("onclick", "approvePhoto(" + pid + ", false)");
      rBtn.innerHTML = svgX + " Reject";
      approveBar.appendChild(vBtn); approveBar.appendChild(aBtn); approveBar.appendChild(rBtn);
      overlay.appendChild(nameEl); overlay.appendChild(approveBar);
      div.appendChild(badge); div.appendChild(overlay);
      grid.appendChild(div);
    });
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────
  window.openLightbox = (idx) => {
    lbMode = "gallery";
    lbIndex = idx;
    showLb();
  };
  window.openPendingLightbox = (idx) => {
    lbMode = "pending";
    lbIndex = idx;
    showLb();
  };
  const showLb = () => {
    const arr = lbMode === "pending" ? pendingPhotos : allPhotos;
    const p = arr[lbIndex];
    if (!p) return;
    const lbImg = document.getElementById("lbImg");
    lbImg.src = "";
    API.loadAuthImage(lbImg, `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${p.id}/file`, DUMP_NAME);
    document.getElementById("lbCaption").textContent =
      p.original_name + "  \u00b7  " + API.formatBytes(p.file_size) + "  \u00b7  " + (p.uploader_name || "Owner");
    // Approve / Reject actions when viewing pending photos
    const lbActions = document.getElementById("lbActions");
    if (lbMode === "pending") {
      const pid = p.id;
      const svgChk = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      const svgX   = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      lbActions.innerHTML =
        '<button class="btn-approve btn-lb" onclick="approveAndAdvance(' + pid + ', true)">' + svgChk + ' Approve</button>' +
        '<button class="btn-reject btn-lb" onclick="approveAndAdvance(' + pid + ', false)">' + svgX + ' Reject</button>';
      lbActions.style.display = "flex";
    } else {
      lbActions.style.display = "none";
      lbActions.innerHTML = "";
    }
    document.getElementById("lightbox").classList.add("open");
  };
  window.closeLightbox = () => document.getElementById("lightbox").classList.remove("open");
  window.lbNav = (dir, e) => {
    e.stopPropagation();
    const arr = lbMode === "pending" ? pendingPhotos : allPhotos;
    lbIndex = (lbIndex + dir + arr.length) % arr.length;
    showLb();
  };
  // Approve/reject from inside the lightbox, then advance or close
  window.approveAndAdvance = async (id, approved) => {
    try {
      await API.patch(`/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${id}/approve?approved=${approved}`);
      API.showToast(approved ? "Photo approved" : "Photo rejected", approved ? "success" : "warn");
      // Refresh pending list
      await loadPhotos();
      // If there are still pending photos, stay in lightbox and show the next one
      if (pendingPhotos.length > 0) {
        lbIndex = Math.min(lbIndex, pendingPhotos.length - 1);
        showLb();
      } else {
        closeLightbox();
      }
    } catch (e) { API.showToast(e.message, "error"); }
  };
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("lightbox").classList.contains("open")) return;
    const arr = lbMode === "pending" ? pendingPhotos : allPhotos;
    if (e.key === "ArrowLeft")  { lbIndex = (lbIndex - 1 + arr.length) % arr.length; showLb(); }
    if (e.key === "ArrowRight") { lbIndex = (lbIndex + 1) % arr.length; showLb(); }
    if (e.key === "Escape") closeLightbox();
  });

  // ── Photo actions ─────────────────────────────────────────────────────────
  window.downloadOne = (id) => {
    const a = document.createElement("a");
    a.href = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${id}/download`;
    a.click();
  };

  window.deletePhoto = async (id) => {
    if (!await API.showConfirm("Delete this photo?", { danger: true, confirmText: "Delete" })) return;
    try {
      await API.del(`/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${id}`);
      loadPhotos();
    } catch (e) { API.showToast(e.message, "error"); }
  };

  window.approvePhoto = async (id, approved) => {
    try {
      await API.patch(`/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${id}/approve?approved=${approved}`);
      API.showToast(approved ? "Photo approved" : "Photo rejected", approved ? "success" : "warn");
      loadPhotos();
    } catch (e) { API.showToast(e.message, "error"); }
  };

  // ── Select all / delete selected ──────────────────────────────────────────
  window.toggleSelectAll = (cb) => {
    document.querySelectorAll("#galleryGrid input[type=checkbox]").forEach(c => c.checked = cb.checked);
    updateDeleteBtn();
  };

  document.getElementById("galleryGrid").addEventListener("change", updateDeleteBtn);
  function updateDeleteBtn() {
    const any = [...document.querySelectorAll("#galleryGrid input[type=checkbox]:checked")].length > 0;
    document.getElementById("deleteSelectedBtn").disabled = !any;
  }

  window.deleteSelected = async () => {
    const ids = [...document.querySelectorAll("#galleryGrid input[type=checkbox]:checked")].map(c => parseInt(c.dataset.id));
    if (!ids.length) return;
    if (!await API.showConfirm(`Delete ${ids.length} photo${ids.length !== 1 ? "s" : ""}?`, { danger: true, confirmText: "Delete" })) return;
    for (const id of ids) {
      try { await API.del(`/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${id}`); } catch {}
    }
    API.showToast(`${ids.length} photo${ids.length !== 1 ? "s" : ""} deleted`, "success");
    loadPhotos();
  };

  // ── Drag & drop upload ────────────────────────────────────────────────────
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    addFiles([...e.dataTransfer.files]);
  });
  fileInput.addEventListener("change", () => {
    addFiles([...fileInput.files]);
    fileInput.value = "";
  });
  // Prevent file-input from capturing dropzone drags
  dropzone.addEventListener("click", (e) => {
    if (e.target === fileInput) return;
  });

  function addFiles(files) {
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif)$/i.test(f.name));
    if (!images.length) return;
    queueFiles.push(...images);
    renderQueue();
  }

  function renderQueue() {
    const queueEl = document.getElementById("uploadQueue");
    const listEl = document.getElementById("queueList");
    const titleEl = document.getElementById("queueTitle");

    // Revoke previous object URLs to free memory
    if (queueEl._objUrls) queueEl._objUrls.forEach(URL.revokeObjectURL);
    queueEl._objUrls = [];

    if (!queueFiles.length) { queueEl.classList.add("hidden"); return; }
    queueEl.classList.remove("hidden");
    titleEl.textContent = `${queueFiles.length} file${queueFiles.length !== 1 ? "s" : ""} selected`;
    listEl.innerHTML = "";

    queueFiles.forEach((f, i) => {
      const objUrl = URL.createObjectURL(f);
      queueEl._objUrls.push(objUrl);
      const item = document.createElement("div");
      item.className = "queue-item";
      item.id = `qi-${i}`;
      item.innerHTML = `
        <img class="qi-thumb" src="${objUrl}" alt="" />
        <span class="qi-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
        <span class="qi-size">${API.formatBytes(f.size)}</span>
        <span class="qi-status pending" id="qis-${i}">Ready</span>
        <button class="qi-remove" onclick="removeFromQueue(${i})" title="Remove">×</button>
      `;
      listEl.appendChild(item);
    });
  }

  window.removeFromQueue = (i) => {
    queueFiles.splice(i, 1);
    renderQueue();
  };

  window.startUpload = async () => {
    const btn = document.getElementById("startUploadBtn");
    btn.disabled = true;
    btn.textContent = "Uploading…";

    // Upload in batches of 10
    const BATCH = 10;
    for (let i = 0; i < queueFiles.length; i += BATCH) {
      const batch = queueFiles.slice(i, i + BATCH);
      const fd = new FormData();
      batch.forEach((f, j) => {
        fd.append("files", f);
        const statusEl = document.getElementById(`qis-${i + j}`);
        if (statusEl) { statusEl.textContent = "Uploading…"; statusEl.className = "qi-status uploading"; }
      });
      fd.append("is_contributor", "false");
      try {
        await API.uploadFiles(
          `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos`,
          fd,
          DUMP_NAME
        );
        batch.forEach((_, j) => {
          const statusEl = document.getElementById(`qis-${i + j}`);
          if (statusEl) { statusEl.textContent = "✓ Done"; statusEl.className = "qi-status done"; }
        });
      } catch (err) {
        batch.forEach((_, j) => {
          const statusEl = document.getElementById(`qis-${i + j}`);
          if (statusEl) { statusEl.textContent = "✗ Error"; statusEl.className = "qi-status error"; }
        });
      }
    }

    btn.textContent = "Upload Complete!";
    API.showToast("Photos uploaded successfully!", "success");
    setTimeout(() => {
      const queueEl = document.getElementById("uploadQueue");
      if (queueEl._objUrls) { queueEl._objUrls.forEach(URL.revokeObjectURL); queueEl._objUrls = []; }
      queueFiles = [];
      queueEl.classList.add("hidden");
      btn.disabled = false;
      btn.textContent = "Upload All";
      loadPhotos();
    }, 1500);
  };

  // ── Copy share info ───────────────────────────────────────────────────────
  window.copyShareInfo = () => {
    const text = `PhotoDump: ${dumpInfo.name}\nURL: ${location.origin}/access-dump?dump=${encodeURIComponent(dumpInfo.name)}`;
    navigator.clipboard.writeText(text)
      .then(() => API.showToast("Share info copied!", "success"))
      .catch(() => prompt("Copy this:", text));
  };

  // ── Delete dump ───────────────────────────────────────────────────────────
  window.confirmDelete = () => document.getElementById("deleteModal").classList.add("open");
  document.getElementById("confirmDeleteBtn").onclick = async () => {
    try {
      await API.del(`/api/dumps/${encodeURIComponent(DUMP_NAME)}`);
      window.location.href = "/dashboard";
    } catch (e) { API.showToast(e.message, "error"); }
  };
  document.getElementById("deleteModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
  });

  // ── Tabs ──────────────────────────────────────────────────────────────────
  window.switchTab = (name, btn) => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${name}`).classList.add("active");
  };

  // ── Settings ─────────────────────────────────────────────────────────────
  function initSettings() {
    const colorInput = document.getElementById("bgColorPicker");
    const colorHex = document.getElementById("bgColorHex");
    if (dumpInfo && dumpInfo.background_color) {
      colorInput.value = dumpInfo.background_color;
      colorHex.textContent = dumpInfo.background_color;
    }
    colorInput.addEventListener("input", () => {
      colorHex.textContent = colorInput.value;
      document.getElementById("colorPreview").style.backgroundColor = colorInput.value;
    });
  }

  window.updateBackgroundColor = async () => {
    const colorInput = document.getElementById("bgColorPicker");
    const color = colorInput.value;

    const btn = document.getElementById("updateColorBtn");
    const originalText = btn.textContent;
    btn.textContent = "Updating…";
    btn.disabled = true;

    try {
      await API.patch(`/api/dumps/${encodeURIComponent(DUMP_NAME)}`, {
        background_color: color,
      });
      dumpInfo.background_color = color;
      // Live-update the gallery background
      const grid = document.getElementById('galleryGrid');
      if (color !== '#0d0f14') {
        grid.style.backgroundColor = color;
        grid.style.padding = '12px';
        grid.style.borderRadius = 'var(--radius)';
      } else {
        grid.style.backgroundColor = '';
        grid.style.padding = '';
        grid.style.borderRadius = '';
      }
      API.showToast("Background color updated!", "success");
    } catch (err) {
      API.showToast("Failed to update background color: " + err.message, "error");
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  await loadDump();
  await loadPhotos();
  initSettings();
})();

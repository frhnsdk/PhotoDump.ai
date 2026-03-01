// find-photos.js — Face search: upload selfie → find matching photos
(async () => {
  const params = new URLSearchParams(location.search);
  const DUMP_NAME = params.get("dump");
  if (!DUMP_NAME) { window.location.href = "/access-dump"; return; }

  const dumpToken = API.getDumpToken(DUMP_NAME);
  const userToken = API.getToken();
  if (!dumpToken && !userToken) {
    window.location.href = `/access-dump?dump=${encodeURIComponent(DUMP_NAME)}`;
    return;
  }

  let selfieFile = null;
  let matchedPhotos = [];
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
      <a class="btn btn-ghost" href="/access-dump">Access Another</a>
    `;
  }

  // Back link
  document.getElementById("backToDump").href =
    `/view-dump?dump=${encodeURIComponent(DUMP_NAME)}`;

  // ── Load dump info ────────────────────────────────────────────────────────
  try {
    const d = await API.get(`/api/dumps/${encodeURIComponent(DUMP_NAME)}`, DUMP_NAME);
    document.title = `Find My Photos — ${d.name} – PhotoDump`;
    document.getElementById("dumpTitle").textContent = d.name;
    document.getElementById("dumpMeta").textContent =
      `${d.photo_count} photos  ·  Find yourself with AI`;
  } catch (err) {
    API.showToast("Cannot load dump.", "error");
    window.location.href = `/access-dump?dump=${encodeURIComponent(DUMP_NAME)}`;
    return;
  }

  // ── Check GPU status ──────────────────────────────────────────────────────
  const banner = document.getElementById("gpuBanner");
  const bannerText = document.getElementById("gpuBannerText");
  const selfieSection = document.getElementById("selfieSection");
  const searchBtn = document.getElementById("searchBtn");

  let gpuAvailable = false;
  try {
    const status = await API.get("/api/gpu/status");
    if (status.available) {
      gpuAvailable = true;
      banner.className = "gpu-banner gpu-banner-ok";
      bannerText.textContent = `GPU server online — ${status.model} model ready`;
    } else {
      banner.className = "gpu-banner gpu-banner-down";
      bannerText.textContent = "GPU server is not up right now";
      selfieSection.classList.add("disabled-section");
    }
  } catch {
    banner.className = "gpu-banner gpu-banner-down";
    bannerText.textContent = "GPU server is not up right now";
    selfieSection.classList.add("disabled-section");
  }

  // ── Selfie upload ─────────────────────────────────────────────────────────
  const dropzone = document.getElementById("selfieDropzone");
  const fileInput = document.getElementById("selfieInput");
  const preview = document.getElementById("selfiePreview");
  const previewWrap = document.getElementById("selfiePreviewWrap");
  const prompt = document.getElementById("selfiePrompt");

  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault(); dropzone.classList.remove("drag-over");
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith("image/"));
    if (f) setSelfie(f);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) setSelfie(fileInput.files[0]);
    fileInput.value = "";
  });

  function setSelfie(file) {
    selfieFile = file;
    const url = URL.createObjectURL(file);
    preview.src = url;
    previewWrap.classList.remove("hidden");
    prompt.classList.add("hidden");
    searchBtn.disabled = !gpuAvailable;
  }

  window.clearSelfie = () => {
    selfieFile = null;
    preview.src = "";
    previewWrap.classList.add("hidden");
    prompt.classList.remove("hidden");
    searchBtn.disabled = true;
    document.getElementById("resultsSection").classList.add("hidden");
    document.getElementById("searchingIndicator").classList.add("hidden");
  };

  // ── Face search ───────────────────────────────────────────────────────────
  window.startFaceSearch = async () => {
    if (!selfieFile || !gpuAvailable) return;

    searchBtn.disabled = true;
    searchBtn.textContent = "Searching…";
    document.getElementById("searchingIndicator").classList.remove("hidden");
    document.getElementById("resultsSection").classList.add("hidden");

    try {
      const fd = new FormData();
      fd.append("file", selfieFile);

      const results = await API.uploadFiles(
        `/api/dumps/${encodeURIComponent(DUMP_NAME)}/find-my-photos`,
        fd, DUMP_NAME
      );

      matchedPhotos = results;
      renderResults();
    } catch (err) {
      API.showToast(err.message || "Search failed", "error");
    } finally {
      searchBtn.disabled = false;
      searchBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Search My Face`;
      document.getElementById("searchingIndicator").classList.add("hidden");
    }
  };

  function renderResults() {
    const section = document.getElementById("resultsSection");
    const grid = document.getElementById("resultsGrid");
    const empty = document.getElementById("resultsEmpty");
    const title = document.getElementById("resultsTitle");

    section.classList.remove("hidden");
    grid.innerHTML = "";

    if (!matchedPhotos.length) {
      empty.classList.remove("hidden");
      title.textContent = "No matches found";
      document.getElementById("downloadMatchedBtn").classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    title.textContent = `Found you in ${matchedPhotos.length} photo${matchedPhotos.length !== 1 ? "s" : ""}!`;
    document.getElementById("downloadMatchedBtn").classList.remove("hidden");

    matchedPhotos.forEach((m, i) => {
      const div = document.createElement("div");
      div.className = "photo-item";
      const url = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${m.photo_id}/file`;
      const confidence = Math.round((1 - m.distance) * 100);
      div.innerHTML = `
        <img alt="${escHtml(m.original_name)}" />
        <div class="photo-overlay">
          <div class="photo-item-actions">
            <button onclick="openLightbox(${i})" title="View">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button onclick="dlOne(${m.photo_id})" title="Download">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>
            </button>
          </div>
        </div>
        <div class="photo-info-bar">
          ${escHtml(m.original_name)}
          <span class="match-badge">${confidence}% match</span>
        </div>
      `;
      const img = div.querySelector("img");
      API.loadAuthImage(img, url, DUMP_NAME);
      grid.appendChild(div);
    });

    // Scroll to results
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Download matched photos ───────────────────────────────────────────────
  window.downloadMatched = () => {
    if (!matchedPhotos.length) return;
    const ids = matchedPhotos.map(m => m.photo_id).join(",");
    const url = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/download-all?ids=${ids}`;
    const headers = {};
    const t = API.getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
    const dt = API.getDumpToken(DUMP_NAME);
    if (dt) headers["X-Dump-Token"] = dt;
    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${DUMP_NAME}_my_photos.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(e => API.showToast("Download failed: " + e.message, "error"));
  };

  window.dlOne = (id) => {
    const a = document.createElement("a");
    a.href = `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${id}/download`;
    if (dumpToken) a.href += `?_dt=${encodeURIComponent(dumpToken)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Lightbox ──────────────────────────────────────────────────────────────
  window.openLightbox = (idx) => { lbIndex = idx; showLb(); };
  const showLb = () => {
    const m = matchedPhotos[lbIndex];
    if (!m) return;
    const lbImg = document.getElementById("lbImg");
    lbImg.src = "";
    API.loadAuthImage(lbImg, `/api/dumps/${encodeURIComponent(DUMP_NAME)}/photos/${m.photo_id}/file`, DUMP_NAME);
    document.getElementById("lbCaption").textContent = m.original_name;
    document.getElementById("lightbox").classList.add("open");
  };
  window.closeLightbox = () => document.getElementById("lightbox").classList.remove("open");
  window.lbNav = (dir, e) => {
    e.stopPropagation();
    lbIndex = (lbIndex + dir + matchedPhotos.length) % matchedPhotos.length;
    showLb();
  };
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("lightbox").classList.contains("open")) return;
    if (e.key === "ArrowLeft")  { lbIndex = (lbIndex - 1 + matchedPhotos.length) % matchedPhotos.length; showLb(); }
    if (e.key === "ArrowRight") { lbIndex = (lbIndex + 1) % matchedPhotos.length; showLb(); }
    if (e.key === "Escape") closeLightbox();
  });
})();

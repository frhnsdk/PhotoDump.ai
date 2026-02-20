// dashboard.js
(async () => {
  if (!API.requireAuth()) return;

  const user = API.getUser();
  if (user) document.getElementById("navUser").textContent = `\u{1F44B} ${user.username}`;

  async function loadDumps() {
    try {
      const dumps = await API.get("/api/dumps/");
      const grid = document.getElementById("dumpsGrid");
      const empty = document.getElementById("emptyState");
      const count = document.getElementById("dumpCount");

      grid.innerHTML = "";

      if (dumps.length === 0) {
        empty.classList.remove("hidden");
        count.textContent = "You have no dumps yet.";
        return;
      }

      empty.classList.add("hidden");
      count.textContent = `${dumps.length} dump${dumps.length !== 1 ? "s" : ""}`;

      dumps.forEach((d) => {
        const card = document.createElement("div");
        card.className = "dump-card";

        let expiryHtml = `<span class="badge badge-success">Unlimited</span>`;
        if (d.expires_at) {
          const exp = new Date(d.expires_at + "Z");
          const now = new Date();
          const daysLeft = Math.ceil((exp - now) / 86400000);
          if (daysLeft <= 0) {
            expiryHtml = `<span class="badge badge-danger">Expired</span>`;
          } else if (daysLeft <= 7) {
            expiryHtml = `<span class="badge badge-warn">Expires in ${daysLeft}d</span>`;
          } else {
            expiryHtml = `<span class="badge">Expires ${API.formatDate(d.expires_at)}</span>`;
          }
        }

        card.innerHTML = `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
            <div class="dump-card-name">${escHtml(d.name)}</div>
            ${expiryHtml}
          </div>
          ${d.description ? `<div class="dump-card-desc">${escHtml(d.description)}</div>` : ""}
          <div class="dump-card-meta">
            <span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg> ${d.photo_count} photo${d.photo_count !== 1 ? "s" : ""}</span>
            <span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg> ${API.formatBytes(d.total_size)}</span>
            <span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${API.formatDate(d.created_at)}</span>
          </div>
          <div class="dump-card-actions">
            <a class="btn btn-primary btn-sm" href="/manage-dump?dump=${encodeURIComponent(d.name)}">Manage →</a>
            <button class="btn btn-outline btn-sm" onclick="copyShare('${escHtml(d.name)}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </button>
            <button class="btn btn-danger btn-sm" onclick="askDelete('${escHtml(d.name)}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Expose to HTML onclick
  window.copyShare = (name) => {
    const text = `Dump: ${name}\nAccess at: ${location.origin}/access-dump?dump=${encodeURIComponent(name)}`;
    navigator.clipboard.writeText(text)
      .then(() => API.showToast("Share info copied!", "success"))
      .catch(() => prompt("Copy this:", text));
  };

  window.askDelete = async (name) => {
    const confirmed = await API.showConfirm(
      `Delete “${name}”?<br><small style="color:#8b92a8">All photos will be permanently removed. This cannot be undone.</small>`,
      { danger: true, confirmText: "Delete Dump" }
    );
    if (!confirmed) return;
    try {
      await API.del(`/api/dumps/${encodeURIComponent(name)}`);
      API.showToast(`“${name}” deleted`, "success");
      loadDumps();
    } catch (err) {
      API.showToast("Failed to delete: " + err.message, "error");
    }
  };

  function escHtml(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  loadDumps();
})();

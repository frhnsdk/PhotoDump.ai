// create-dump.js
(async () => {
  if (!API.requireAuth()) return;

  // Color picker preview
  const colorInput = document.getElementById("bgColorPicker");
  const colorHex = document.getElementById("bgColorHex");
  const colorPreview = document.getElementById("colorPreview");
  colorInput.addEventListener("input", () => {
    colorHex.textContent = colorInput.value;
    colorPreview.style.backgroundColor = colorInput.value;
  });

  // Show / hide custom day input
  document.querySelectorAll("input[name=duration]").forEach((radio) => {
    radio.addEventListener("change", () => {
      const custom = document.getElementById("customDays");
      if (radio.value === "custom" && radio.checked) {
        custom.classList.remove("hidden");
        custom.required = true;
      } else {
        custom.classList.add("hidden");
        custom.required = false;
      }
    });
  });

  document.getElementById("createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("createBtn");
    const errEl = document.getElementById("createError");
    errEl.classList.add("hidden");

    const durationVal = document.querySelector("input[name=duration]:checked").value;
    let duration_days = null;
    if (durationVal !== "unlimited") {
      duration_days = durationVal === "custom"
        ? parseInt(document.getElementById("customDays").value, 10)
        : parseInt(durationVal, 10);
      if (isNaN(duration_days) || duration_days < 1) {
        errEl.textContent = "Please enter a valid number of days.";
        errEl.classList.remove("hidden");
        return;
      }
    }

    btn.textContent = "Creating…";
    btn.disabled = true;

    try {
      const data = await API.post("/api/dumps/", {
        name: document.getElementById("dumpName").value.trim(),
        description: document.getElementById("dumpDesc").value.trim() || null,
        password: document.getElementById("dumpPass").value,
        duration_days,
        background_color: document.getElementById("bgColorPicker").value,
      });
      // Redirect to manage page
      window.location.href = `/manage-dump?dump=${encodeURIComponent(data.name)}`;
    } catch (err) {
      errEl.textContent = err.message || "Failed to create dump.";
      errEl.classList.remove("hidden");
      btn.textContent = "Create Dump →";
      btn.disabled = false;
    }
  });
})();

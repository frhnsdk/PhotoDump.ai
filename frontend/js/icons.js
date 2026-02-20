/**
 * icons.js — Glass-style SVG icon definitions for PhotoDump
 * Usage: ICONS.camera  →  raw SVG string (no glass bg)
 *        ICONS.glass('camera', 'purple')  →  glass-pill wrapped SVG
 */
const ICONS = (() => {
  // 24×24 path-only SVG fragments (white stroke, no fill)
  const paths = {
    camera:    `<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>`,
    upload:    `<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>`,
    gallery:   `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`,
    clock:     `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
    download:  `<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>`,
    trash:     `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>`,
    copy:      `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>`,
    zoom:      `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
    check:     `<polyline points="20 6 9 17 4 12"/>`,
    xmark:     `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
    key:       `<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>`,
    link:      `<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>`,
    plus:      `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
    grid:      `<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>`,
    arrowLeft: `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
    arrowRight:`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`,
    logout:    `<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>`,
    share:     `<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>`,
    infinity:  `<path d="M12 12c-2-2.5-4-4-6-4a4 4 0 000 8c2 0 4-1.5 6-4zm0 0c2 2.5 4 4 6 4a4 4 0 000-8c-2 0-4 1.5-6 4z"/>`,
    user:      `<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    lock:      `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>`,
    eye:       `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`,
    image:     `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`,
    folder:    `<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>`,
    star:      `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
  };

  // Build a standalone SVG (no glass bg) — for use inside buttons
  const svg = (name, size = 16, extraClass = "") => {
    const p = paths[name];
    if (!p) return "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" class="icon-svg${extraClass ? " " + extraClass : ""}"
      aria-hidden="true">${p}</svg>`;
  };

  // Glass-pill wrapped icon — for tabs, features, navbars
  // color: 'purple' | 'teal' | 'blue' | 'green' | 'red' | 'orange'
  const glass = (name, color = "purple", size = 22) => {
    const gradients = {
      purple: ["#9b8ff8", "#6c5ff0"],
      teal:   ["#38d9c0", "#1ba89a"],
      blue:   ["#5ba8f5", "#2c7ae0"],
      green:  ["#4ade80", "#16a34a"],
      red:    ["#f87171", "#dc2626"],
      orange: ["#fb923c", "#ea580c"],
      pink:   ["#f472b6", "#db2777"],
    };
    const [c1, c2] = gradients[color] || gradients.purple;
    const uid = `g_${name}_${color}`;
    const p = paths[name];
    if (!p) return "";
    return `<span class="gl-icon" style="--gl1:${c1};--gl2:${c2}" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
        fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2.2" stroke-linecap="round"
        stroke-linejoin="round">${p}</svg>
    </span>`;
  };

  return { svg, glass, paths };
})();

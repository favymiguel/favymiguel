---
name: verify
description: Build/launch/drive recipe for verifying the Amelia beat-store site (static HTML/CSS/JS at repo root).
---

# Verifying the Amelia site

Static site, no build step. Files: `index.html`, `styles.css`, `app.js` at repo root.

## Launch

```bash
python3 -m http.server 8899 --bind 127.0.0.1 &   # serve repo root
```

## Drive (Playwright + pre-installed Chromium)

Use `executablePath: '/opt/pw-browsers/chromium'` with `--no-sandbox` and
`NO_PROXY="127.0.0.1,localhost"` (the session's HTTPS proxy otherwise breaks
localhost tunnels).

Flows worth driving:
- Click a `.beat-row` → sticky `#player` appears, `#progressFill` advances, row shows EQ bars.
  Audio is procedural WebAudio (no files) — prove signal with an AnalyserNode on `AudioEngine.master`.
- Re-click row = pause; `#playBtn`, `#prevBtn`/`#nextBtn`, click `#progressBar` to seek.
- `#beatSearch` + tag chips filter the list (empty state on no match).
- `.beat-price` → license modal → Add to Cart; duplicate add shows "Already in cart" toast.
- `#cartBtn` drawer: totals, remove, checkout toast; cart persists via localStorage across reload.
- Mobile (390px): `#navToggle` menu, compact beat rows.

## Gotchas

- Elements toggled via the `hidden` attribute rely on the `[hidden] { display:none !important }`
  rule in `styles.css` — author `display:flex/grid` on those elements would otherwise defeat
  `hidden` and the invisible modal overlay swallows every click on the page.

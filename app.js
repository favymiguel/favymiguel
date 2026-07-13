/* ============================================================
   AMELIA — beat store front-end
   - Catalog rendering + search/tag filtering
   - Procedural WebAudio beat previews (no audio files needed;
     swap `AudioEngine` for <audio> tags when real MP3s exist)
   - Sticky player, license modal, cart drawer
   ============================================================ */

"use strict";

/* ---------------- Catalog data ---------------- */

const BEATS = [
  { id: "midnight-bloom", title: "Midnight Bloom", tags: ["Afrobeats", "Rema", "Smooth"], genre: "Afrobeats", bpm: 102, key: "A Min", root: 45, scale: "minor", style: "afro",      duration: 165, price: 34.99, hue: 268 },
  { id: "lagos-nights",   title: "Lagos Nights",   tags: ["Amapiano", "Log Drum", "Club"], genre: "Amapiano",  bpm: 112, key: "D Min", root: 38, scale: "minor", style: "afro",      duration: 178, price: 34.99, hue: 205 },
  { id: "velvet-sky",     title: "Velvet Sky",     tags: ["Trapsoul", "Bryson", "Dark"],   genre: "R&B",       bpm: 140, key: "F# Min", root: 42, scale: "minor", style: "trap",     duration: 152, price: 34.99, hue: 318 },
  { id: "golden-hour",    title: "Golden Hour",    tags: ["Pop", "Afro-fusion", "Uplifting"], genre: "Pop",    bpm: 98,  key: "C Maj", root: 36, scale: "major", style: "rnb",       duration: 171, price: 39.99, hue: 38  },
  { id: "wavelength",     title: "Wavelength",     tags: ["Trap", "808", "Hard"],          genre: "Trap",      bpm: 145, key: "G Min", root: 43, scale: "minor", style: "trap",      duration: 149, price: 29.99, hue: 0   },
  { id: "ocean-drive",    title: "Ocean Drive",    tags: ["Dancehall", "Summer", "Bounce"], genre: "Dancehall", bpm: 100, key: "E Min", root: 40, scale: "minor", style: "dancehall", duration: 160, price: 34.99, hue: 165 },
  { id: "stardust",       title: "Stardust",       tags: ["Drill", "UK", "Sliding 808"],   genre: "Drill",     bpm: 142, key: "Bb Min", root: 34, scale: "minor", style: "trap",     duration: 144, price: 29.99, hue: 232 },
  { id: "honey",          title: "Honey",          tags: ["Neo-Soul", "Keys", "Warm"],     genre: "R&B",       bpm: 88,  key: "Eb Maj", root: 39, scale: "major", style: "rnb",      duration: 186, price: 39.99, hue: 92  },
];

const LICENSES = [
  { id: "mp3",     name: "MP3 Lease",  price: 34.99,  popular: false, feats: ["Untagged MP3", "5,000 streams", "1 music video", "Non-exclusive"] },
  { id: "wav",     name: "WAV Lease",  price: 49.99,  popular: true,  feats: ["WAV + MP3", "100,000 streams", "Unlimited videos", "Radio: 2 stations"] },
  { id: "stems",   name: "Trackout",   price: 99.99,  popular: false, feats: ["Full stems + WAV", "500,000 streams", "Unlimited videos", "Paid performances"] },
  { id: "unltd",   name: "Unlimited",  price: 199.99, popular: false, feats: ["Full stems + WAV", "Unlimited streams", "Unlimited everything", "Non-exclusive"] },
];

const KITS = [
  { id: "drum-vault",   name: "Amelia Drum Vault Vol. 1", desc: "220+ punchy kicks, snares, rims & 808s straight from the catalog.", price: 29.99, emoji: "🥁", hue: 280 },
  { id: "afro-perc",    name: "Afro Percussion Essentials", desc: "150 live-played shakers, congas, talking drums & log drums.", price: 24.99, emoji: "🪘", hue: 25 },
  { id: "melodic-tex",  name: "Melodic Textures", desc: "80 lush loops & one-shots — keys, guitars, pads. All stems labeled.", price: 19.99, emoji: "🎹", hue: 200 },
  { id: "vocal-chops",  name: "Vocal Chops & Adlibs", desc: "120 processed chops, phrases & adlibs, cleared for commercial use.", price: 14.99, emoji: "🎤", hue: 330 },
];

/* ---------------- Small utilities ---------------- */

const $ = (sel) => document.querySelector(sel);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const fmtPrice = (n) => `$${n.toFixed(2)}`;
const artStyle = (hue) =>
  `background: linear-gradient(135deg, hsl(${hue},70%,52%), hsl(${(hue + 60) % 360},72%,38%))`;

// deterministic RNG so every beat always previews the same
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

/* ---------------- Procedural audio engine ----------------
   Generates a 2-bar loop (32 sixteenth steps) per beat from a
   seeded pattern: kick, snare/clap, hats, 808 bass and a pluck
   melody in the beat's key. Deterministic per beat id.        */

const AudioEngine = {
  ctx: null,
  master: null,
  timer: null,
  current: null,     // beat object
  step: 0,
  nextTime: 0,
  startedAt: 0,      // ctx.currentTime when playback (re)started
  offset: 0,         // seconds already elapsed before startedAt
  playing: false,

  ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
  },

  midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  buildPattern(beat) {
    const rnd = mulberry32(hashStr(beat.id));
    const P = { kick: new Array(32).fill(0), snare: new Array(32).fill(0), hat: new Array(32).fill(0), open: new Array(32).fill(0), bass: [], mel: [] };

    const styles = {
      afro:      { kick: [0, 6, 10, 16, 22, 26], snare: [8, 24], hatEvery: 2, swing: true  },
      trap:      { kick: [0, 10, 16, 20],        snare: [8, 24], hatEvery: 1, swing: false },
      rnb:       { kick: [0, 7, 16, 23],         snare: [8, 24], hatEvery: 2, swing: true  },
      dancehall: { kick: [0, 8, 16, 24],         snare: [6, 14, 22, 30], hatEvery: 2, swing: false },
    };
    const st = styles[beat.style] || styles.trap;

    st.kick.forEach((i) => (P.kick[i] = 1));
    st.snare.forEach((i) => (P.snare[i] = 1));
    // seeded kick variation
    for (let i = 0; i < 32; i++) if (!P.kick[i] && !P.snare[i] && rnd() < 0.06) P.kick[i] = 0.7;

    for (let i = 0; i < 32; i += st.hatEvery) P.hat[i] = rnd() < 0.85 ? (i % 4 === 0 ? 1 : 0.6) : 0;
    if (beat.style === "trap") { // hat rolls
      const rollAt = 12 + Math.floor(rnd() * 4) * 4;
      for (let i = rollAt; i < rollAt + 4 && i < 32; i++) P.hat[i] = 0.5;
    }
    P.open[14] = rnd() < 0.5 ? 0.5 : 0;
    P.open[30] = 0.5;

    // 808 bass follows the kick: root, sometimes fifth / octave
    const bassOpts = [0, 0, 0, 7, 12, -5];
    for (let i = 0; i < 32; i++) {
      if (P.kick[i]) P.bass.push({ step: i, semi: bassOpts[Math.floor(rnd() * bassOpts.length)] });
    }

    // pluck melody: seeded walk over the pentatonic scale, 2 bars
    const scale = beat.scale === "major" ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
    let deg = Math.floor(rnd() * 5);
    const rhythm = [0, 3, 6, 10, 14, 16, 19, 22, 26, 30].filter(() => rnd() < 0.8);
    rhythm.forEach((stepIdx) => {
      deg = Math.max(0, Math.min(9, deg + Math.floor(rnd() * 5) - 2));
      const oct = Math.floor(deg / 5), note = scale[deg % 5] + 12 * oct;
      P.mel.push({ step: stepIdx, semi: note, len: rnd() < 0.3 ? 2 : 1 });
    });

    P.swing = st.swing;
    return P;
  },

  /* ----- voices ----- */
  playKick(t, vel = 1) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    g.gain.setValueAtTime(0.95 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.35);
  },

  noiseBuf() {
    if (this._noise) return this._noise;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this._noise = buf);
  },

  playSnare(t, vel = 1) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf();
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.2);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain(); // body
    o.type = "triangle"; o.frequency.setValueAtTime(190, t);
    og.gain.setValueAtTime(0.28 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.1);
  },

  playHat(t, vel = 1, open = false) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf();
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
    const g = this.ctx.createGain();
    const dur = open ? 0.22 : 0.045;
    g.gain.setValueAtTime(0.22 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp); hp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + dur + 0.02);
  },

  playBass(t, freq, dur) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  playPluck(t, freq, dur) {
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    [0, 6].forEach((det) => {
      const o = this.ctx.createOscillator();
      o.type = "triangle"; o.frequency.value = freq; o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.05);
    });
    lp.connect(g); g.connect(this.master);
  },

  /* ----- scheduler ----- */
  scheduleStep(step, t) {
    const b = this.current, P = b._pattern;
    if (P.kick[step]) this.playKick(t, P.kick[step]);
    if (P.snare[step]) this.playSnare(t);
    if (P.hat[step]) this.playHat(t, P.hat[step]);
    if (P.open[step]) this.playHat(t, P.open[step], true);
    const spb = 60 / b.bpm;
    P.bass.forEach((n) => { if (n.step === step) this.playBass(t, this.midiToFreq(b.root + n.semi), spb * 0.9); });
    P.mel.forEach((n) => { if (n.step === step) this.playPluck(t, this.midiToFreq(b.root + 24 + n.semi), spb * n.len * 0.9); });
  },

  tick() {
    const b = this.current;
    const stepDur = 60 / b.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      let t = this.nextTime;
      if (b._pattern.swing && this.step % 2 === 1) t += stepDur * 0.14;
      this.scheduleStep(this.step, t);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 32;
    }
  },

  play(beat, fromOffset = 0) {
    this.ensureCtx();
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.stopScheduler();
    this.current = beat;
    if (!beat._pattern) beat._pattern = this.buildPattern(beat);
    const stepDur = 60 / beat.bpm / 4;
    this.offset = fromOffset;
    this.step = Math.floor(fromOffset / stepDur) % 32;
    this.startedAt = this.ctx.currentTime;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.playing = true;
    this.timer = setInterval(() => this.tick(), 25);
  },

  pause() {
    if (!this.playing) return;
    this.offset = this.elapsed();
    this.stopScheduler();
    this.playing = false;
  },

  stopScheduler() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  elapsed() {
    if (!this.ctx || !this.current) return 0;
    return this.playing ? this.offset + (this.ctx.currentTime - this.startedAt) : this.offset;
  },

  setVolume(v) { if (this.master) this.master.gain.value = v; },
};

/* ---------------- Player UI ---------------- */

const Player = {
  el: $("#player"),
  raf: null,

  load(beat, autoplay = true) {
    $("#playerArt").style.cssText = artStyle(beat.hue);
    $("#playerTitle").textContent = beat.title;
    $("#playerSub").textContent = `${beat.genre} · ${beat.bpm} BPM · ${beat.key}`;
    $("#timeDur").textContent = fmtTime(beat.duration);
    this.el.hidden = false;
    if (autoplay) { AudioEngine.play(beat, 0); this.syncUI(); this.loop(); }
  },

  toggle() {
    const b = AudioEngine.current;
    if (!b) return;
    if (AudioEngine.playing) AudioEngine.pause();
    else { AudioEngine.play(b, AudioEngine.elapsed()); this.loop(); }
    this.syncUI();
  },

  skip(dir) {
    const b = AudioEngine.current;
    if (!b) return;
    const idx = BEATS.findIndex((x) => x.id === b.id);
    const next = BEATS[(idx + dir + BEATS.length) % BEATS.length];
    this.load(next, true);
  },

  seek(frac) {
    const b = AudioEngine.current;
    if (!b) return;
    const target = frac * b.duration;
    if (AudioEngine.playing) AudioEngine.play(b, target);
    else AudioEngine.offset = target;
    this.updateProgress();
  },

  syncUI() {
    $("#iconPlay").style.display = AudioEngine.playing ? "none" : "";
    $("#iconPause").style.display = AudioEngine.playing ? "" : "none";
    document.querySelectorAll(".beat-row").forEach((row) => {
      const active = AudioEngine.current && row.dataset.id === AudioEngine.current.id && AudioEngine.playing;
      row.classList.toggle("playing", !!active);
      row.querySelector(".beat-index").innerHTML = active
        ? '<span class="eq"><span></span><span></span><span></span></span>'
        : row.dataset.num;
    });
  },

  updateProgress() {
    const b = AudioEngine.current;
    if (!b) return;
    const t = Math.min(AudioEngine.elapsed(), b.duration);
    $("#timeCur").textContent = fmtTime(t);
    $("#progressFill").style.width = `${(t / b.duration) * 100}%`;
    if (t >= b.duration && AudioEngine.playing) this.skip(1); // auto-advance
  },

  loop() {
    cancelAnimationFrame(this.raf);
    const frame = () => {
      this.updateProgress();
      if (AudioEngine.playing) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  },
};

/* ---------------- Cart ---------------- */

const Cart = {
  items: [],

  loadSaved() {
    try { this.items = JSON.parse(localStorage.getItem("amelia-cart") || "[]"); } catch { this.items = []; }
    this.render();
  },
  save() {
    try { localStorage.setItem("amelia-cart", JSON.stringify(this.items)); } catch { /* private mode */ }
  },
  add(item) {
    if (this.items.some((i) => i.key === item.key)) { toast("Already in cart"); return; }
    this.items.push(item);
    this.save(); this.render();
    toast(`Added to cart — ${item.name}`);
  },
  remove(key) {
    this.items = this.items.filter((i) => i.key !== key);
    this.save(); this.render();
  },
  total() { return this.items.reduce((s, i) => s + i.price, 0); },

  render() {
    $("#cartCount").textContent = this.items.length;
    const box = $("#cartItems");
    if (!this.items.length) {
      box.innerHTML = '<p class="cart-empty">Your cart is empty.<br/>Go grab a beat 🎧</p>';
    } else {
      box.innerHTML = this.items.map((i) => `
        <div class="cart-item">
          <div class="cart-item-art" style="${artStyle(i.hue)}"></div>
          <div class="cart-item-meta"><strong>${i.name}</strong><span>${i.sub}</span></div>
          <div class="cart-item-price">${fmtPrice(i.price)}</div>
          <button class="cart-remove" data-key="${i.key}" aria-label="Remove">✕</button>
        </div>`).join("");
      box.querySelectorAll(".cart-remove").forEach((btn) =>
        btn.addEventListener("click", () => this.remove(btn.dataset.key)));
    }
    $("#cartTotal").textContent = fmtPrice(this.total());
  },
};

/* ---------------- Rendering ---------------- */

let activeTag = "All";
let searchTerm = "";

function renderBeats() {
  const list = $("#beatList");
  const term = searchTerm.toLowerCase();
  const filtered = BEATS.filter((b) => {
    const matchTag = activeTag === "All" || b.genre === activeTag;
    const hay = `${b.title} ${b.genre} ${b.tags.join(" ")} ${b.key}`.toLowerCase();
    return matchTag && (!term || hay.includes(term));
  });

  if (!filtered.length) {
    list.innerHTML = '<p class="beat-empty">No beats match — try another search.</p>';
    return;
  }

  list.innerHTML = filtered.map((b, i) => `
    <div class="beat-row" data-id="${b.id}" data-num="${i + 1}">
      <span class="beat-index">${i + 1}</span>
      <div class="beat-art" style="${artStyle(b.hue)}">
        <span>${b.title[0]}</span>
        <span class="play-overlay"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span>
      </div>
      <div class="beat-title">
        <strong>${b.title}</strong>
        <span class="beat-tags">${b.tags.map((t) => `#${t}`).join(" ")}</span>
      </div>
      <span class="beat-bpm"><span class="col-label">BPM</span>${b.bpm}</span>
      <span class="beat-key"><span class="col-label">Key</span>${b.key}</span>
      <span class="beat-time"><span class="col-label">Time</span>${fmtTime(b.duration)}</span>
      <button class="beat-price" data-license="${b.id}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        ${fmtPrice(b.price)}
      </button>
    </div>`).join("");

  list.querySelectorAll(".beat-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".beat-price")) return;
      const beat = BEATS.find((b) => b.id === row.dataset.id);
      if (AudioEngine.current && AudioEngine.current.id === beat.id) Player.toggle();
      else Player.load(beat, true);
      Player.syncUI();
    });
  });
  list.querySelectorAll(".beat-price").forEach((btn) =>
    btn.addEventListener("click", () => openLicenseModal(btn.dataset.license)));

  Player.syncUI();
}

function renderTags() {
  const tags = ["All", ...new Set(BEATS.map((b) => b.genre))];
  $("#tagRow").innerHTML = tags.map((t) =>
    `<button class="tag-chip ${t === activeTag ? "active" : ""}" data-tag="${t}">${t}</button>`).join("");
  $("#tagRow").querySelectorAll(".tag-chip").forEach((chip) =>
    chip.addEventListener("click", () => { activeTag = chip.dataset.tag; renderTags(); renderBeats(); }));
}

function renderKits() {
  $("#kitGrid").innerHTML = KITS.map((k) => `
    <div class="kit-card">
      <div class="kit-cover" style="${artStyle(k.hue)}"><span>${k.emoji}</span></div>
      <div class="kit-body">
        <h3>${k.name}</h3>
        <p>${k.desc}</p>
        <div class="kit-foot">
          <span class="kit-price">${fmtPrice(k.price)}</span>
          <button class="btn btn-outline btn-sm" data-kit="${k.id}">Add to Cart</button>
        </div>
      </div>
    </div>`).join("");
  $("#kitGrid").querySelectorAll("[data-kit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const k = KITS.find((x) => x.id === btn.dataset.kit);
      Cart.add({ key: `kit:${k.id}`, name: k.name, sub: "Sound Kit", price: k.price, hue: k.hue });
    }));
}

/* ---------------- License modal ---------------- */

function openLicenseModal(beatId) {
  const b = BEATS.find((x) => x.id === beatId);
  if (!b) return;
  $("#modalArt").style.cssText = artStyle(b.hue);
  $("#modalTitle").textContent = b.title;
  $("#modalMeta").textContent = `${b.genre} · ${b.bpm} BPM · ${b.key}`;
  $("#licenseGrid").innerHTML = LICENSES.map((L) => `
    <div class="license-card ${L.popular ? "popular" : ""}">
      <div class="license-name">${L.name}${L.popular ? '<span class="license-pop">Best Value</span>' : ""}</div>
      <div class="license-price">${fmtPrice(L.price)}</div>
      <ul class="license-feats">${L.feats.map((f) => `<li>${f}</li>`).join("")}</ul>
      <button class="btn btn-primary btn-sm" data-buy="${L.id}">Add to Cart</button>
    </div>`).join("");
  $("#licenseGrid").querySelectorAll("[data-buy]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const L = LICENSES.find((x) => x.id === btn.dataset.buy);
      Cart.add({ key: `beat:${b.id}:${L.id}`, name: b.title, sub: `${L.name} License`, price: L.price, hue: b.hue });
      closeModal();
    }));
  $("#licenseModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#licenseModal").hidden = true;
  document.body.style.overflow = "";
}

/* ---------------- Toast ---------------- */

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ---------------- Wiring ---------------- */

function init() {
  $("#year").textContent = new Date().getFullYear();
  renderTags();
  renderBeats();
  renderKits();
  Cart.loadSaved();

  // search
  $("#beatSearch").addEventListener("input", (e) => { searchTerm = e.target.value; renderBeats(); });

  // player controls
  $("#playBtn").addEventListener("click", () => Player.toggle());
  $("#prevBtn").addEventListener("click", () => Player.skip(-1));
  $("#nextBtn").addEventListener("click", () => Player.skip(1));
  $("#progressBar").addEventListener("click", (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    Player.seek((e.clientX - r.left) / r.width);
  });
  $("#volume").addEventListener("input", (e) => AudioEngine.setVolume(e.target.value / 100));
  $("#playerLicense").addEventListener("click", () => {
    if (AudioEngine.current) openLicenseModal(AudioEngine.current.id);
  });

  // modal
  $("#modalClose").addEventListener("click", closeModal);
  $("#licenseModal").addEventListener("click", (e) => { if (e.target.id === "licenseModal") closeModal(); });
  $("#modalContactLink").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeCart(); }
  });

  // cart drawer
  const openCart = () => { $("#cartOverlay").hidden = false; document.body.style.overflow = "hidden"; };
  const closeCart = () => { $("#cartOverlay").hidden = true; document.body.style.overflow = ""; };
  $("#cartBtn").addEventListener("click", openCart);
  $("#cartClose").addEventListener("click", closeCart);
  $("#cartOverlay").addEventListener("click", (e) => { if (e.target.id === "cartOverlay") closeCart(); });
  $("#checkoutBtn").addEventListener("click", () => {
    if (!Cart.items.length) { toast("Your cart is empty"); return; }
    toast("Demo checkout — connect Stripe/PayPal to go live 🚀");
  });

  // mobile nav
  $("#navToggle").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
  $("#mainNav").querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => $("#mainNav").classList.remove("open")));

  // contact form (demo — swap for Formspree/backend to go live)
  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const subject = encodeURIComponent(`[Amelia] ${data.get("subject")} — ${data.get("name")}`);
    const body = encodeURIComponent(`${data.get("message")}\n\n— ${data.get("name")} (${data.get("email")})`);
    window.location.href = `mailto:bookings@amelia.com?subject=${subject}&body=${body}`;
    toast("Opening your email app…");
  });
}

document.addEventListener("DOMContentLoaded", init);

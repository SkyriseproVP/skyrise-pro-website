/**
 * ════════════════════════════════════════════════════════════════════════
 *  SKY ORB — the one Sky avatar. DO NOT FORK THIS FILE.
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Sky looks and behaves the same on every dashboard. Before 2026-10-06 the
 *  orb was pasted into 8 pages with 3 different loop functions (startOrb,
 *  startBoardOrb, startCCOrb) and had already drifted: the app smoothed the
 *  voice, the Tmrw Sports board did not, Jago's command center was frozen on
 *  idle, and the public website demo was running an older orb entirely.
 *  Everything now loads THIS file.
 *
 *  Adding a surface:
 *      <script src="/sky-orb.js"></script>
 *      const orb = SkyOrb.mount('my-canvas', {
 *        getSession: () => activeConversation,   // or null if no voice yet
 *        getMode:    () => orbMode               // 'idle' | 'listening' | ...
 *      });
 *
 *  The DRAWING is the canonical nova-core avatar hard-coded 2026-07-14:
 *  deep navy field, two drifting interior lobes, offset white nova core with
 *  star flares, neon cyan ring. For idle / listening / speaking with bands
 *  off it issues a provably identical sequence of canvas operations to the
 *  original inline drawOrb() -- verified by call-log diff, not by eye.
 *  Do not restyle it here. Changing this file changes Sky everywhere.
 *
 *  States: idle · listening · thinking · speaking · success · error
 *  Bands:  off by default. When supplied, bass drives the lobes, mid adds
 *          turbulence, high shimmers the ring and lengthens the flares.
 */
(function (global) {
  'use strict';

  var VERSION = '2026-10-06';

  var REDUCED_MOTION = (function () {
    try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  })();

  /* ── palette ──────────────────────────────────────────────────────────
     Amber is the trouble colour. Red is not in Sky's palette -- it belongs
     to the Engineer in the stakeholder colours -- and restrained warm amber
     is the one warm accent the brand allows. */
  var CYAN  = { l1:'80,200,250',  l2:'150,240,255',  lmid:'0,130,205',
                cmid:'110,228,255', c28:'215,252,255',
                ring:'190,248,255', glow:'0,220,255', bg0:'0,70,120,0.60' };
  var AMBER = { l1:'250,196,110', l2:'255,220,165', lmid:'190,120,20',
                cmid:'255,205,130', c28:'255,236,206',
                ring:'255,224,178', glow:'255,170,50', bg0:'70,46,10,0.55' };

  /**
   * Draw one frame.
   * @param canvas  target canvas
   * @param ctx     its 2d context
   * @param t       seconds-ish elapsed (advances 0.9 per real second)
   * @param mode    idle | listening | thinking | speaking | success | error
   * @param vol     0..1 voice level
   * @param bands   optional { bass, mid, high } each 0..1
   */
  function draw(canvas, ctx, t, mode, vol, bands) {
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2;
    var R = w / 2;

    var bass = bands ? bands.bass : 0;
    var mid  = bands ? bands.mid  : 0;
    var high = bands ? bands.high : 0;

    ctx.clearRect(0, 0, w, h);

    var speaking  = mode === 'speaking';
    var listening = mode === 'listening';
    var thinking  = mode === 'thinking';
    var error     = mode === 'error';
    var success   = mode === 'success';

    var P = error ? AMBER : CYAN;
    var dim = error ? 0.62 : 1;

    var spd = speaking ? 1.6 + vol * 1.8
            : thinking ? 2.15
            : listening ? 0.8
            : error ? 0.22
            : 0.35;

    var amp = speaking ? Math.min(1, vol * 1.15)
            : thinking ? 0.12
            : listening ? 0.16 + 0.10 * Math.sin(t * 2.6)
            : error ? 0.035 + 0.025 * Math.sin(t * 1.15)
            : success ? 0.55 + 0.30 * Math.max(0, Math.sin(t * 6))
            : 0.05 + 0.03 * Math.sin(t * 0.8);

    var ringR = R * 0.90;
    var bodyR = R * 0.84;

    // Orb body - deep navy field
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, bodyR, 0, Math.PI * 2); ctx.clip();
    var bg = ctx.createRadialGradient(cx, cy + bodyR * 0.12, 0, cx, cy, bodyR);
    bg.addColorStop(0, 'rgba(' + P.bg0 + ')');
    bg.addColorStop(0.72, 'rgba(4,12,28,0.96)');
    bg.addColorStop(1, 'rgba(4,12,28,1)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    // Two slow interior lobes
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'blur(' + Math.max(1, R * 0.03) + 'px)';
    var turb = mid * bodyR * 0.022;
    var lobes = [
      { x: cx + Math.sin(t * spd * 0.50) * bodyR * 0.17 + Math.sin(t * 7.3) * turb,
        y: cy + Math.cos(t * spd * 0.40) * bodyR * 0.15 + Math.cos(t * 6.1) * turb,
        rad: bodyR * 0.75 * (1 + amp * 0.12 + bass * 0.085),
        a: (0.45 + amp * 0.30) * dim, cr: P.l1 },
      { x: cx - Math.cos(t * spd * 0.34) * bodyR * 0.19 - Math.cos(t * 8.7) * turb,
        y: cy - Math.sin(t * spd * 0.46) * bodyR * 0.13 - Math.sin(t * 5.9) * turb,
        rad: bodyR * 0.58 * (1 + amp * 0.12 + bass * 0.070),
        a: (0.38 + amp * 0.28) * dim, cr: P.l2 }
    ];
    lobes.forEach(function (b) {
      var g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rad);
      g.addColorStop(0, 'rgba(' + b.cr + ',' + b.a + ')');
      g.addColorStop(0.62, 'rgba(' + P.lmid + ',' + (b.a * 0.5) + ')');
      g.addColorStop(1, 'rgba(0,0,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.rad, 0, Math.PI * 2); ctx.fill();
    });

    // Nova core - offset upper-left, breathes, flares with the voice
    var nx = cx - bodyR * 0.16 + Math.sin(t * spd * 0.6) * bodyR * 0.03;
    var ny = cy - bodyR * 0.20 + Math.cos(t * spd * 0.5) * bodyR * 0.03;
    var coreR = bodyR * (0.30 + amp * 0.16) * (error ? 0.84 : 1);
    var core = ctx.createRadialGradient(nx, ny, 0, nx, ny, coreR);
    core.addColorStop(0, 'rgba(255,255,255,' + (0.98 * dim) + ')');
    core.addColorStop(0.28, 'rgba(' + P.c28 + ',' + (0.92 * dim) + ')');
    core.addColorStop(0.58, 'rgba(' + P.cmid + ',' + ((0.45 + amp * 0.3) * dim) + ')');
    core.addColorStop(1, 'rgba(0,0,20,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(nx, ny, coreR, 0, Math.PI * 2); ctx.fill();

    // Star flares (horizontal + vertical streaks)
    var flare = function (sx, sy, len) {
      ctx.save();
      ctx.translate(nx, ny); ctx.scale(sx, sy);
      var fg = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
      fg.addColorStop(0, 'rgba(255,255,255,' + ((0.85 + amp * 0.15) * dim) + ')');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(0, 0, len, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    flare(1, 0.055, bodyR * (0.78 + amp * 0.22 + high * 0.10));
    flare(0.055, 1, bodyR * (0.58 + amp * 0.18 + high * 0.08));

    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Neon ring
    var pulse = listening ? (0.5 + 0.5 * Math.sin(t * 3.2))
              : error ? (0.5 + 0.5 * Math.sin(t * 1.15)) * 0.5
              : 0;
    ctx.save();
    ctx.strokeStyle = 'rgba(' + P.ring + ',' + (0.95 * dim) + ')';
    ctx.lineWidth = Math.max(1.4, R * 0.024);
    ctx.shadowColor = 'rgba(' + P.glow + ',' +
      Math.min(1, (0.65 + amp * 0.35 + pulse * 0.2 + high * 0.25) * dim) + ')';
    ctx.shadowBlur = R * (0.10 + amp * 0.14 + pulse * 0.07 + high * 0.06);
    ctx.beginPath(); ctx.arc(cx, cy, ringR * (1 + amp * 0.02), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Thinking: one bright segment travelling the ring. Reads as "working"
    // without ever swelling like speech -- he must not look like he is talking.
    if (thinking) {
      var a0 = (t * 1.5) % (Math.PI * 2);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = Math.max(1.6, R * 0.028);
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(32,227,255,0.95)';
      ctx.shadowBlur = R * 0.16;
      ctx.beginPath(); ctx.arc(cx, cy, ringR, a0, a0 + 0.62); ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Give the canvas a backing store that matches how big it is actually drawn,
   * so Sky is equally crisp on every surface.
   *
   * 2026-10-06: the pages had each guessed their own buffer size, and the
   * ratios ranged from 1.0x to 2.44x. The app's full-screen explore orb
   * (220 buffer at 220 CSS px) and the website demo's orb (128 at 128) were
   * rendering 1:1, so they looked soft next to the 2.44x ones -- same shape,
   * different sharpness, which reads as "that is not the same Sky".
   *
   * The on-screen size never changes. Some pages size the canvas from CSS
   * (the app uses a responsive clamp) and some relied on the width/height
   * ATTRIBUTES for layout (the website demo did). Pinning an inline px size
   * unconditionally would freeze the responsive ones, so instead the size is
   * measured, the buffer is changed, and the size is re-measured -- the inline
   * pin is applied ONLY if the layout actually moved.
   */
  var DPR_CAP = 2;   // past 2x the extra pixels are not perceptible, just cost

  function sizeBackingStore(canvas) {
    try {
      var before = canvas.getBoundingClientRect();
      var cssW = before.width || canvas.clientWidth || 0;
      var cssH = before.height || canvas.clientHeight || 0;
      if (!cssW || !cssH) return;              // hidden or detached; leave it alone

      var dpr = Math.min(global.devicePixelRatio || 1, DPR_CAP);
      var w = Math.max(1, Math.round(cssW * dpr));
      var h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width === w && canvas.height === h) return;

      canvas.width = w;
      canvas.height = h;                       // also clears it; next frame repaints

      // Did changing the attributes move the layout? Only then pin the size.
      var after = canvas.getBoundingClientRect();
      if (Math.abs(after.width - cssW) > 0.5 || Math.abs(after.height - cssH) > 0.5) {
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }
    } catch (e) { /* never let sizing stop the orb */ }
  }

  /**
   * Start an orb on a canvas and keep it alive no matter what.
   *
   * Four ways the old inline loops died permanently, all silently:
   *   1. the volume getter throwing escaped the loop, so requestAnimationFrame
   *      was never re-scheduled -- Sky's face froze mid-sentence;
   *   2. one NaN from the getter poisoned the smoothed volume forever;
   *   3. a missing canvas threw on getContext before the loop started;
   *   4. t advanced per FRAME, so the orb ran ~2x fast on a 120Hz phone.
   * All four are contained here, once, for every surface.
   *
   * @param canvasId  element id
   * @param opts.getSession  () => voice session (getOutputVolume/getInputVolume) or null
   * @param opts.getMode     () => state string
   * @param opts.getBands    () => { bass, mid, high } or null   (optional)
   * @param opts.getVolume   () => 0..1 to FORCE the level, or null to read the
   *                         session instead (optional). Needed by pages that
   *                         animate Sky from pre-rendered TTS or a scripted
   *                         demo, where there is no ConvAI session to measure.
   * @returns { stop, setMode, getMode, el } or null if the canvas is absent
   */
  function mount(canvasId, opts) {
    opts = opts || {};
    var canvas = typeof canvasId === 'string'
      ? document.getElementById(canvasId)
      : canvasId;
    if (!canvas) {
      if (global.console) console.warn('SkyOrb: no canvas ' + canvasId);
      return null;
    }
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) {
      if (global.console) console.warn('SkyOrb: no 2d context on ' + canvasId);
      return null;
    }

    sizeBackingStore(canvas);
    var onResize = function () { sizeBackingStore(canvas); };
    if (global.addEventListener) global.addEventListener('resize', onResize);

    var frame = null, t = 0, last = 0, vol = 0, stopped = false;
    var localMode = 'idle';
    var getMode = opts.getMode || function () { return localMode; };
    var getSession = opts.getSession || function () { return null; };
    var getBands = opts.getBands || function () { return null; };
    var getVolume = opts.getVolume || function () { return null; };

    function tick(now) {
      if (stopped) return;

      // Delta time scaled by 0.9 so the breathing rate is IDENTICAL to the old
      // 0.015-per-frame at 60Hz, but no longer tied to refresh rate.
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.0167;
      last = now;
      t += dt * 0.9 * (REDUCED_MOTION ? 0.35 : 1);

      var mode = 'idle';
      try { mode = getMode() || 'idle'; } catch (e) { mode = 'idle'; }

      // Sky listens with the mic and speaks with his own output. Reading only
      // the output meant the orb never reacted to the person talking.
      // A page-supplied getVolume() wins, for TTS playback and scripted demos
      // where there is no ConvAI session to measure.
      var target = 0;
      try {
        var forced = getVolume();
        if (typeof forced === 'number' && isFinite(forced)) {
          target = Math.max(0, Math.min(1, forced));
        } else {
          var s = getSession();
          if (s) {
            var raw = mode === 'listening'
              ? (s.getInputVolume ? s.getInputVolume() : (s.getOutputVolume ? s.getOutputVolume() : 0))
              : (s.getOutputVolume ? s.getOutputVolume() : 0);
            if (typeof raw === 'number' && isFinite(raw)) {
              target = Math.max(0, Math.min(1, raw));
            }
          }
        }
      } catch (e) { target = 0; }   // a bad read costs one frame, never the loop

      // Asymmetric smoothing: fast attack with the voice, slow decay after it.
      if (!isFinite(vol)) vol = 0;
      vol += (target - vol) * (target > vol ? 0.22 : 0.07);

      var bands = null;
      try { bands = getBands(); } catch (e) { bands = null; }

      try {
        draw(canvas, ctx, t, mode, vol, bands);
      } catch (e) {
        if (global.console) console.error('SkyOrb frame failed:', e);
      }

      frame = global.requestAnimationFrame(tick);
    }

    frame = global.requestAnimationFrame(tick);

    return {
      el: canvas,
      stop: function () {
        stopped = true;
        if (frame) global.cancelAnimationFrame(frame);
        frame = null;
        // Drop the resize handler too, or remounting across screens stacks
        // one listener per mount for the life of the page.
        if (global.removeEventListener) global.removeEventListener('resize', onResize);
      },
      setMode: function (m) { localMode = m; },
      getMode: function () { return getMode(); }
    };
  }

  global.SkyOrb = {
    VERSION: VERSION,
    REDUCED_MOTION: REDUCED_MOTION,
    draw: draw,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);

/* Skyrise Pro — TI cost-of-delay calculator (the compact one).
 *
 * Victor, 2026-10-19: when someone books a demo, requests a strategy call or is
 * sent a link from a DM, they should see the chart, add how many projects they
 * run, and see what they are losing per month — and the time.
 *
 * The math is the homepage TI ROI calculator's (index.html calcROI), with the
 * project count entered directly instead of picked from a tier:
 *   lost to chasing / month = hours/week × rate × projects × 4.33
 *   hours lost / month      = hours/week × projects × 4.33
 *   free rent at risk       = whole 15-day blocks of the slip × credit × projects
 * Their losses only. Never a Skyrise price.
 *
 *   SkyCost.mount(el, { projects, hours, rate, credit, slip, compact, onChange })
 *   -> { values() }   values() = inputs + results, ready to send with a booking
 */
(function () {
  'use strict';

  var DEF = { projects: 1, hours: 8, rate: 75, credit: 15000, slip: 30 };
  var LIM = {
    projects: [1, 50, 1], hours: [1, 30, 1], rate: [25, 250, 5],
    credit: [2500, 60000, 500], slip: [0, 90, 15]
  };

  function clamp(k, v) {
    var l = LIM[k]; v = Math.round(Number(v));
    if (!isFinite(v)) return DEF[k];
    return Math.min(l[1], Math.max(l[0], v));
  }

  function compute(i) {
    var cost = Math.round(i.hours * i.rate * i.projects * 4.33);
    var blocks = Math.floor(i.slip / 15);
    return {
      cost_month: cost,
      cost_year: cost * 12,
      hours_month: Math.round(i.hours * i.projects * 4.33),
      rent_at_risk: Math.round(blocks * i.credit * i.projects),
      blocks: blocks
    };
  }

  function money(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return '$' + Math.round(n);
  }

  /* The shareable link: numbers only, never a name or an email. */
  function chartUrl(i) {
    return 'https://skyrisepro.ai/cost.html?p=' + i.projects + '&h=' + i.hours + '&r=' + i.rate +
      '&c=' + i.credit + '&s=' + i.slip;
  }

  var CSS =
    '.sc{background:linear-gradient(160deg,#0a1628,#0d1b30);border:1.5px solid rgba(0,200,232,.55);border-radius:16px;padding:18px;color:#eaf6ff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left;}' +
    '.sc *{box-sizing:border-box;}' +
    '.sc-k{font-family:Orbitron,sans-serif;font-size:9.5px;font-weight:800;letter-spacing:2px;color:#00c8e8;margin:0 0 12px;}' +
    '.sc-proj{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;margin-bottom:12px;}' +
    '.sc-lbl{font-family:Orbitron,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.6px;color:rgba(234,246,255,.75);}' +
    '.sc-step{display:flex;align-items:center;gap:6px;}' +
    '.sc-step button{width:34px;height:34px;border-radius:8px;border:1.5px solid rgba(0,200,232,.6);background:transparent;color:#00c8e8;font-size:18px;font-weight:700;line-height:1;cursor:pointer;transition:background .15s,color .15s;}' +
    '.sc-step button:hover{background:#00c8e8;color:#04121f;}' +
    '.sc-step button:focus-visible,.sc input:focus-visible,.sc summary:focus-visible{outline:2px solid #00deff;outline-offset:2px;}' +
    '.sc-step input{width:56px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;text-align:center;font-family:Orbitron,sans-serif;font-size:16px;font-weight:800;-moz-appearance:textfield;}' +
    '.sc-step input::-webkit-outer-spin-button,.sc-step input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}' +
    '.sc-out{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;}' +
    '.sc-tile{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 10px 9px;min-width:0;}' +
    '.sc-n{font-family:Orbitron,sans-serif;font-size:19px;font-weight:800;color:#fff;line-height:1.1;white-space:nowrap;}' +
    '.sc-tile.cost .sc-n{color:#ff5a5a;}.sc-tile.rent .sc-n{color:#ff8a4c;}' +
    '.sc-l{font-family:Orbitron,sans-serif;font-size:7.5px;font-weight:700;letter-spacing:1.2px;line-height:1.45;color:rgba(234,246,255,.6);margin-top:6px;}' +
    '.sc-chart{position:relative;height:130px;margin-bottom:6px;}' +
    '.sc-adj{border-top:1px solid rgba(255,255,255,.08);margin-top:8px;padding-top:8px;}' +
    '.sc-adj summary{cursor:pointer;font-size:12px;color:#00c8e8;list-style:none;display:inline-flex;align-items:center;gap:6px;}' +
    '.sc-adj summary::-webkit-details-marker{display:none;}' +
    '.sc-adj summary::before{content:"\\25B8";transition:transform .15s;display:inline-block;}' +
    '.sc-adj[open] summary::before{transform:rotate(90deg);}' +
    '.sc-row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;margin-top:10px;}' +
    '.sc-row label{font-size:12px;color:rgba(234,246,255,.8);}' +
    '.sc-row output{font-family:Orbitron,sans-serif;font-size:11px;font-weight:700;color:#00c8e8;}' +
    '.sc-row input{grid-column:1/-1;width:100%;accent-color:#00c8e8;}' +
    '.sc-note{font-size:11.5px;line-height:1.5;color:rgba(234,246,255,.55);margin:8px 0 0;}' +
    '.sc.compact{padding:14px;}.sc.compact .sc-n{font-size:16px;}.sc.compact .sc-chart{height:104px;}' +
    '@media(max-width:480px){.sc-out{grid-template-columns:1fr;}.sc-n{font-size:18px;}}';

  function injectCss() {
    if (document.getElementById('sc-css')) return;
    var s = document.createElement('style'); s.id = 'sc-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function fromQuery() {
    var out = {};
    try {
      var q = new URLSearchParams(location.search);
      [['p', 'projects'], ['h', 'hours'], ['r', 'rate'], ['c', 'credit'], ['s', 'slip']].forEach(function (m) {
        if (q.has(m[0])) out[m[1]] = clamp(m[1], q.get(m[0]));
      });
    } catch (e) {}
    return out;
  }

  function mount(el, opts) {
    opts = opts || {};
    injectCss();
    var i = {};
    Object.keys(DEF).forEach(function (k) { i[k] = clamp(k, opts[k] != null ? opts[k] : DEF[k]); });
    if (opts.fromQuery) { var q = fromQuery(); Object.keys(q).forEach(function (k) { i[k] = q[k]; }); }

    var uid = 'sc' + Math.random().toString(36).slice(2, 7);
    var slider = function (k, label) {
      var l = LIM[k];
      return '<div class="sc-row"><label for="' + uid + k + '">' + label + '</label><output id="' + uid + k + 'o"></output>' +
        '<input type="range" id="' + uid + k + '" min="' + l[0] + '" max="' + l[1] + '" step="' + l[2] + '" value="' + i[k] + '"></div>';
    };
    el.innerHTML =
      '<div class="sc' + (opts.compact ? ' compact' : '') + '">' +
        '<div class="sc-k">WHAT CHASING STATUS IS COSTING YOU</div>' +
        '<div class="sc-proj"><span class="sc-lbl">ACTIVE TI PROJECTS</span>' +
          '<div class="sc-step"><button type="button" data-d="-1" aria-label="One fewer project">&minus;</button>' +
          '<input type="number" inputmode="numeric" min="1" max="50" value="' + i.projects + '" aria-label="Active TI projects">' +
          '<button type="button" data-d="1" aria-label="One more project">+</button></div></div>' +
        '<div class="sc-out" aria-live="polite">' +
          '<div class="sc-tile cost"><div class="sc-n" data-o="cost"></div><div class="sc-l">LOST TO CHASING STATUS, PER MONTH</div></div>' +
          '<div class="sc-tile"><div class="sc-n" data-o="hrs"></div><div class="sc-l">OF YOUR TEAM’S TIME, PER MONTH</div></div>' +
          '<div class="sc-tile rent"><div class="sc-n" data-o="rent"></div><div class="sc-l" data-o="rentl"></div></div>' +
        '</div>' +
        '<div class="sc-chart"><canvas role="img" aria-label="Cost of chasing status per month and per year, and free rent at risk"></canvas></div>' +
        '<details class="sc-adj"><summary>Adjust the assumptions</summary>' +
          slider('hours', 'Hours a week chasing status, per project') +
          slider('rate', 'Team hourly rate') +
          slider('credit', 'Free rent credited per 15 days late') +
          slider('slip', 'Days a build slips past delivery') +
        '</details>' +
        '<p class="sc-note">Typical TI defaults. Use the credit written in your own lease. Free rent is credited in whole 15-day blocks.</p>' +
      '</div>';

    var root = el.firstChild;
    var num = root.querySelector('.sc-step input');
    var chart = null;

    function render() {
      var r = compute(i);
      root.querySelector('[data-o=cost]').textContent = money(r.cost_month);
      root.querySelector('[data-o=hrs]').textContent = r.hours_month.toLocaleString() + ' hrs';
      root.querySelector('[data-o=rent]').textContent = money(r.rent_at_risk);
      root.querySelector('[data-o=rentl]').textContent = r.blocks
        ? 'FREE RENT IF ' + (i.projects > 1 ? 'EACH BUILD SLIPS ' : 'IT SLIPS ') + i.slip + ' DAYS'
        : 'FREE RENT — UNDER 15 DAYS LATE, NO BLOCK YET';
      root.querySelector('#' + uid + 'hourso').textContent = i.hours + ' hrs';
      root.querySelector('#' + uid + 'rateo').textContent = '$' + i.rate + '/hr';
      root.querySelector('#' + uid + 'credito').textContent = money(i.credit);
      root.querySelector('#' + uid + 'slipo').textContent = i.slip + ' days';
      var data = [r.cost_month, r.cost_year, r.rent_at_risk];
      if (window.Chart) {
        if (!chart) {
          chart = new Chart(root.querySelector('canvas'), {
            type: 'bar',
            data: { labels: ['Chasing / month', 'Chasing / year', 'Rent at risk'],
              datasets: [{ data: data, backgroundColor: ['#e53e3e', '#b42318', '#ff6b35'], borderRadius: 6, barPercentage: .7, categoryPercentage: .8 }] },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return money(c.raw); } } } },
              scales: {
                x: { ticks: { color: 'rgba(234,246,255,.45)', font: { size: 10 }, callback: function (v) { return money(v); }, maxTicksLimit: 5 }, grid: { color: 'rgba(255,255,255,.06)' } },
                y: { ticks: { color: 'rgba(234,246,255,.75)', font: { size: 11 } }, grid: { display: false } } } }
          });
        } else { chart.data.datasets[0].data = data; chart.update(); }
      }
      if (opts.onChange) opts.onChange(api.values());
    }

    function setProjects(v) { i.projects = clamp('projects', v); num.value = i.projects; render(); }
    root.querySelectorAll('.sc-step button').forEach(function (b) {
      b.addEventListener('click', function () { setProjects(i.projects + Number(b.getAttribute('data-d'))); });
    });
    num.addEventListener('change', function () { setProjects(num.value); });
    num.addEventListener('input', function () { if (num.value !== '') setProjects(num.value); });
    ['hours', 'rate', 'credit', 'slip'].forEach(function (k) {
      root.querySelector('#' + uid + k).addEventListener('input', function (e) { i[k] = clamp(k, e.target.value); render(); });
    });

    var api = {
      values: function () {
        var r = compute(i);
        return {
          projects: i.projects, hours_week: i.hours, team_rate: i.rate, rent_credit_15: i.credit, slip_days: i.slip,
          cost_month: r.cost_month, cost_year: r.cost_year, hours_month: r.hours_month, rent_at_risk: r.rent_at_risk,
          chart_url: chartUrl(i),
          intel_line: i.projects + ' TI project' + (i.projects > 1 ? 's' : '') + ' · ~' + money(r.cost_month) +
            '/mo chasing status · ' + r.hours_month + ' hrs/mo · ' + money(r.rent_at_risk) + ' rent at risk per ' + i.slip + '-day slip'
        };
      },
      resize: function () { if (chart) chart.resize(); }
    };
    render();
    return api;
  }

  window.SkyCost = { mount: mount, compute: compute, money: money };
})();

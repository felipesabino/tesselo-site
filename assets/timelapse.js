// Time-lapse map of shop openings and closures (blog). Fills every <figure class="timelapse" data-src="…">
// with a map, a month slider, counters and a chart of openings and closures. Data: apps/site/tools/timelapse-data.mjs. Needs maplibre-gl.
(() => {
  const MONTHS_PER_SECOND = 6;
  const POP = 3; // months an opening stays bright
  const FADE = 4; // months a closure stays visible
  const fr = document.documentElement.lang !== 'en';
  const t_ = (f, e) => (fr ? f : e);
  const locale = fr ? 'fr-FR' : 'en-GB';
  const mercX = (lon) => (lon + 180) / 360;
  const mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;

  for (const fig of document.querySelectorAll('figure.timelapse')) {
    fig.innerHTML = `
      <div class="tl-map"><div class="tl-base"></div><canvas></canvas></div>
      <div class="tl-panel">
        <p class="tl-date" aria-live="off">…</p>
        <dl>
          <dt class="tl-open">${t_('Enregistrés comme ouverts', 'Registered as open')}</dt><dd></dd>
          <dt class="tl-in">${t_('Ouvertures depuis janvier', 'Openings since January')}</dt><dd></dd>
          <dt class="tl-out">${t_('Fermetures depuis janvier', 'Closures since January')}</dt><dd></dd>
        </dl>
        <select aria-label="${t_('Type de commerce', 'Type of shop')}"><option value="-1">${t_('Tous les commerces', 'All shops')}</option></select>
        <div class="tl-row">
          <button class="ts-btn" type="button">${t_('Lecture', 'Play')}</button>
          <input type="range" min="0" value="0" step="1" aria-label="${t_('Mois affiché', 'Month shown')}" />
        </div>
      </div>
      <div class="tl-chart">
        <p class="tl-legend">
          <span><i></i>${t_('Ouvertures sur 12 mois', 'Openings over 12 months')} <b></b></span>
          <span><i class="tl-dash"></i>${t_('Fermetures sur 12 mois', 'Closures over 12 months')} <b></b></span>
        </p>
        <svg role="img" aria-label="${t_(
          'Ouvertures et fermetures sur les douze mois précédents, de 2009 à 2026. Cliquez pour aller à une date.',
          'Openings and closures over the previous twelve months, 2009 to 2026. Click to jump to a date.',
        )}"></svg>
      </div>
      <figcaption class="note">${t_(
        'Source : INSEE, répertoire SIRENE (Licence Ouverte 2.0). Un commerce repris ou déplacé compte pour une fermeture et une ouverture. Le répertoire enregistre les fermetures avec retard : le nombre de commerces ouverts est un maximum.',
        'Source: INSEE, SIRENE register (Licence Ouverte 2.0). A shop taken over or moved counts as one closure and one opening. The register records closures late: the number of open shops is an upper bound.',
      )}</figcaption>`;
    const canvas = fig.querySelector('canvas');
    const g = canvas.getContext('2d');
    const [nOpen, nIn, nOut] = fig.querySelectorAll('dd');
    const date = fig.querySelector('.tl-date');
    const select = fig.querySelector('select');
    const button = fig.querySelector('button');
    const slider = fig.querySelector('input');
    const svg = fig.querySelector('.tl-chart svg');
    const [cIn, cOut] = fig.querySelectorAll('.tl-legend b');
    const map = new maplibregl.Map({
      container: fig.querySelector('.tl-base'),
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [2.3488, 48.8589],
      zoom: 10.6,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: true, // the page scrolls past the map
      locale: fr
        ? {
            'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer',
            'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer',
            'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer la carte',
          }
        : {},
    });
    map.touchZoomRotate.disableRotation(); // the dot layer assumes north up, no tilt
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.fitBounds([[2.2242, 48.8156], [2.4699, 48.9022]], { padding: 12, animate: false });

    let data = null, xs, ys, t = 0, type = -1, playing = false, last = 0;
    let roll = null; // [openings, closures] over the 12 months ending at each month; null before a full year
    const L = 46, R = 12, T = 8, B = 22, H = 170; // chart margins and height, px
    const chartX = (m) => L + (m / (data.months - 1)) * (svg.clientWidth - L - R);

    function series() {
      roll = [2, 3].map((col) => {
        const n = new Array(data.months).fill(0);
        for (const row of data.rows) if ((type < 0 || row[4] === type) && row[col] !== null && row[col] >= 0) n[row[col]]++;
        let sum = 0;
        return n.map((v, m) => ((sum += v - (n[m - 12] ?? 0)), m < 11 ? null : sum));
      });
      drawChart();
    }
    function drawChart() {
      if (!roll) return;
      const w = svg.clientWidth, max = Math.max(1, ...roll.flat());
      const p = 10 ** Math.floor(Math.log10(max)), top = Math.max(2, Math.ceil(max / p) * p);
      const y = (v) => T + (1 - v / top) * (H - T - B);
      const year0 = +data.from.slice(0, 4), step = w < 600 ? 4 : 2;
      // Covid: first lockdown (March 2020) to the reopening of shops and terraces (May 2021).
      const m0 = (2020 - year0) * 12 + 2, m1 = (2021 - year0) * 12 + 4;
      let out = `<rect class="tl-covid" x="${chartX(m0)}" y="${T}" width="${chartX(m1) - chartX(m0)}" height="${H - T - B}"/><text x="${chartX((m0 + m1) / 2)}" y="${T + 13}" text-anchor="middle">Covid</text>`;
      for (const v of [0, top / 2, top]) {
        out += `<line class="tl-grid" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString(locale)}</text>`;
      }
      for (let yr = year0 + 1; (yr - year0) * 12 < data.months; yr += step) {
        out += `<text x="${chartX((yr - year0) * 12)}" y="${H - 5}" text-anchor="middle">${yr}</text>`;
      }
      roll.forEach((vals, i) => {
        const pts = vals.map((v, m) => (v === null ? '' : `${chartX(m).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
        out += `<polyline class="${i ? 'tl-line-out' : 'tl-line-in'}" points="${pts}"/>`;
      });
      svg.innerHTML = out + `<line class="tl-cursor" y1="${T}" y2="${H - B}"/>`;
      cursor();
    }
    /** The vertical line at the film's date, and the two values at that date. */
    function cursor() {
      const line = svg.lastChild, m = Math.floor(t);
      if (!line) return;
      line.setAttribute('x1', chartX(t));
      line.setAttribute('x2', chartX(t));
      cIn.textContent = roll[0][m]?.toLocaleString(locale) ?? '–';
      cOut.textContent = roll[1][m]?.toLocaleString(locale) ?? '–';
    }
    function seek(e) {
      if (!data || !e.buttons) return;
      const x = e.clientX - svg.getBoundingClientRect().left;
      t = Math.round(Math.min(1, Math.max(0, (x - L) / (svg.clientWidth - L - R))) * (data.months - 1));
      slider.value = t;
      draw();
    }

    function draw() {
      if (!data) return;
      const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const world = 512 * 2 ** map.getZoom(), c = map.getCenter(), cx = mercX(c.lng), cy = mercY(c.lat);
      const r = Math.max(1.2, (map.getZoom() - 9) * 0.7), yearStart = Math.floor(t / 12) * 12;
      let open = 0, opened = 0, closed = 0;
      const pops = [], fades = [];
      g.fillStyle = 'rgb(28 61 90 / .55)';
      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i], o = row[2], cl = row[3];
        if (o > t) break; // rows are in opening order
        if (type >= 0 && row[4] !== type) continue;
        if (o >= yearStart) opened++;
        const gone = cl !== null && cl <= t;
        if (gone && cl >= yearStart) closed++;
        if (!gone) open++;
        if (gone && t - cl >= FADE) continue;
        const x = (xs[i] - cx) * world + w / 2, y = (ys[i] - cy) * world + h / 2;
        if (x < -8 || y < -8 || x > w + 8 || y > h + 8) continue;
        if (gone) fades.push(x, y, 1 - (t - cl) / FADE);
        else if (o >= 0 && t - o < POP) pops.push(x, y, 1 - (t - o) / POP);
        else g.fillRect(x - r / 2, y - r / 2, r, r);
      }
      for (const [list, rgb] of [[fades, '179 38 30'], [pops, '11 93 85']]) {
        for (let i = 0; i < list.length; i += 3) {
          g.fillStyle = `rgb(${rgb} / ${0.25 + 0.75 * list[i + 2]})`;
          g.beginPath();
          g.arc(list[i], list[i + 1], r * (1 + 1.5 * list[i + 2]), 0, 7);
          g.fill();
        }
      }
      const d = new Date(Date.UTC(+data.from.slice(0, 4), +data.from.slice(5, 7) - 1 + Math.floor(t), 1));
      date.textContent = d.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
      nOpen.textContent = open.toLocaleString(locale);
      nIn.textContent = opened.toLocaleString(locale);
      nOut.textContent = closed.toLocaleString(locale);
      cursor();
    }

    function tick(now) {
      if (!playing) return;
      t = Math.min(t + ((now - last) / 1000) * MONTHS_PER_SECOND, data.months - 1);
      last = now;
      slider.value = Math.floor(t);
      draw();
      if (t >= data.months - 1) setPlaying(false);
      else requestAnimationFrame(tick);
    }
    function setPlaying(on) {
      playing = on;
      button.textContent = on ? 'Pause' : t_('Lecture', 'Play');
      if (!on) return;
      if (t >= data.months - 1) t = 0;
      last = performance.now();
      requestAnimationFrame(tick);
    }

    button.onclick = () => data && setPlaying(!playing);
    slider.oninput = () => { t = +slider.value; draw(); };
    select.onchange = () => { type = +select.value; series(); draw(); };
    svg.onpointerdown = svg.onpointermove = seek;
    new ResizeObserver(drawChart).observe(svg);
    map.on('move', draw);
    map.on('resize', draw);

    fetch(fig.dataset.src)
      .then((res) => res.json())
      .then((j) => {
        data = j;
        xs = Float64Array.from(j.rows, (row) => mercX(row[0] / 1e5));
        ys = Float64Array.from(j.rows, (row) => mercY(row[1] / 1e5));
        slider.max = j.months - 1;
        // Open on the last month: the full picture before anyone presses play.
        slider.value = t = j.months - 1;
        j.labels.forEach((l, i) => select.add(new Option(l[fr ? 0 : 1], i)));
        series();
        draw();
      })
      .catch(() => { date.textContent = t_('La carte n’a pas pu être chargée.', 'The map could not be loaded.'); });
  }
})();

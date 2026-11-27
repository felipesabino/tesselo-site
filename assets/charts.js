// Charts for blog posts. Draws every <figure class="chart"> from the JSON in its <script type="application/json">:
//   { "type": "bars", "labels": [...], "series": [{ "name": "…", "values": [...] }], "unit": " %", "signed": true }
//   { "type": "line", "x": [2019, 2020, …], "series": [...], "band": [2020, 2021], "bandLabel": "Covid" }
// Bars are horizontal, one or two series; "signed" shows + and − and colours by sign. A line chart starts at zero.
// Hovering a bar or a point shows its value (native tooltip).
(() => {
  const locale = document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR';
  const COLORS = ['var(--accent)', 'var(--indep)'];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  /** Text width estimate at 12px, enough to reserve room for labels. */
  const width = (s) => String(s).length * 7.2;

  function bars(c, w) {
    const fmt = (v) => (c.signed && v > 0 ? '+' : '') + v.toLocaleString(locale).replace('-', '−') + (c.unit ?? '');
    const all = c.series.flatMap((s) => s.values);
    const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    // On a narrow screen the label sits on its own line above the bar.
    const stacked = w < 520, labelW = stacked ? 0 : Math.max(...c.labels.map(width)) + 10;
    const valueW = Math.max(...all.map((v) => width(fmt(v)))) + 14;
    const x0 = labelW + (lo < 0 ? valueW : 0), x1 = w - valueW;
    const x = (v) => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0);
    const barH = c.series.length > 1 ? 11 : 16, pad = stacked ? 18 : 0, rowH = c.series.length * (barH + 2) + 10 + pad;
    let out = `<line class="chart-axis" x1="${x(0)}" x2="${x(0)}" y1="0" y2="${c.labels.length * rowH}"/>`;
    c.labels.forEach((label, i) => {
      const top = i * rowH + 5 + pad;
      out += stacked
        ? `<text x="0" y="${top - 6}">${esc(label)}</text>`
        : `<text x="${labelW - 8}" y="${top + (rowH - 10) / 2 + 4}" text-anchor="end">${esc(label)}</text>`;
      c.series.forEach((s, k) => {
        const v = s.values[i], y = top + k * (barH + 2), a = Math.min(x(0), x(v)), len = Math.max(1, Math.abs(x(v) - x(0)));
        const fill = c.signed ? (v < 0 ? '#b3261e' : COLORS[0]) : COLORS[k];
        out += `<rect x="${a}" y="${y}" width="${len}" height="${barH}" rx="2" fill="${fill}"><title>${esc(label)}${c.series.length > 1 ? `, ${esc(s.name)}` : ''} : ${fmt(v)}</title></rect>`;
        out += `<text x="${v < 0 ? a - 5 : a + len + 5}" y="${y + barH / 2 + 4}" text-anchor="${v < 0 ? 'end' : 'start'}">${fmt(v)}</text>`;
      });
    });
    return { height: c.labels.length * rowH, out };
  }

  function line(c, w) {
    const L = 52, R = 14, T = 10, B = 24, H = 220;
    const max = Math.max(1, ...c.series.flatMap((s) => s.values));
    const p = 10 ** Math.floor(Math.log10(max)), top = Math.ceil(max / p) * p;
    const x = (i) => L + (i / (c.x.length - 1)) * (w - L - R), y = (v) => T + (1 - v / top) * (H - T - B);
    let out = '';
    if (c.band) {
      // Half a step on each side: a year's value covers the whole year.
      const a = x(c.x.indexOf(c.band[0]) - 0.5), b = x(c.x.indexOf(c.band[1]) + 0.5);
      out += `<rect class="chart-band" x="${a}" y="${T}" width="${b - a}" height="${H - T - B}"/><text x="${(a + b) / 2}" y="${T + 13}" text-anchor="middle">${esc(c.bandLabel ?? '')}</text>`;
    }
    for (const v of [0, top / 2, top]) out += `<line class="chart-grid" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString(locale)}${c.unit ?? ''}</text>`;
    const step = Math.ceil((c.x.length * 38) / (w - L - R));
    c.x.forEach((label, i) => { if ((c.x.length - 1 - i) % step === 0) out += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${label}</text>`; });
    c.series.forEach((s, k) => {
      out += `<polyline points="${s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" stroke="${COLORS[k]}"${k ? ' stroke-dasharray="5 3"' : ''}/>`;
      s.values.forEach((v, i) => { out += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${COLORS[k]}"><title>${c.x[i]}${c.series.length > 1 ? `, ${esc(s.name)}` : ''} : ${v.toLocaleString(locale)}${c.unit ?? ''}</title></circle>`; });
    });
    return { height: H, out };
  }

  for (const fig of document.querySelectorAll('figure.chart')) {
    const c = JSON.parse(fig.querySelector('script').textContent);
    const plot = document.createElement('div');
    fig.querySelector('script').after(plot);
    if (c.series.length > 1) {
      plot.innerHTML = `<p class="chart-legend">${c.series.map((s, k) => `<span><i style="background:${COLORS[k]}"></i>${esc(s.name)}</span>`).join('')}</p>`;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', fig.querySelector('.chart-title')?.textContent ?? '');
    plot.append(svg);
    new ResizeObserver(() => {
      const { height, out } = (c.type === 'line' ? line : bars)(c, svg.clientWidth);
      svg.style.height = `${height}px`;
      svg.innerHTML = out;
    }).observe(svg);
  }
})();

// Maps in blog posts. Fills every <figure class="postmap" data-src="…json" data-label="…"> with a map of Paris and a legend,
// placed before the figure's own <figcaption> (source and licence, written in the post). Needs maplibre-gl.
// Data (apps/site/tools/street-rules-map-data.mjs):
//   { "type": "lines" | "points" | "areas", "outline": true (areas as thin as a street: also draws their outline),
//     "categories": [{ "fr": "…", "en": "…", "color": "accent" | "indep" | "gold" | "#rrggbb", "dash": true, "wide": true, "hollow": true }],
//     "features": [{ "c": 0, "g": [[lon, lat], …] or [lon, lat] or [ring], "t": "name", "d": ["détail", "detail"] }] }
// "color" is a CSS variable of style.css, or a hex colour when a map needs more than three (checked for colour-blind readers). Hovering or clicking a feature shows its name (or its category) and detail.
(() => {
  const fr = document.documentElement.lang !== 'en';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  for (const fig of document.querySelectorAll('figure.postmap')) {
    const box = document.createElement('div');
    box.className = 'pm-map';
    const legend = document.createElement('ul');
    legend.className = 'pm-legend';
    fig.querySelector('figcaption').before(box, legend);

    const map = new maplibregl.Map({
      container: box,
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
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.fitBounds([[2.2242, 48.8156], [2.4699, 48.9022]], { padding: 12, animate: false });
    if (fig.dataset.label) map.getCanvas().setAttribute('aria-label', fig.dataset.label);

    const loaded = new Promise((done) => map.on('load', done));
    fetch(fig.dataset.src)
      .then((r) => r.json())
      .then(async (data) => {
        const lines = data.type === 'lines', areas = data.type === 'areas';
        const hex = (c) => (c.color[0] === '#' ? c.color : `var(--${c.color})`);
        const css = getComputedStyle(fig);
        legend.innerHTML = data.categories
          .map((c) => `<li><i class="${lines ? (c.dash ? 'pm-dash' : '') : c.hollow ? 'pm-ring' : areas ? 'pm-dot pm-sq' : 'pm-dot'}" style="color: ${hex(c)}"></i>${esc(fr ? c.fr : c.en)}</li>`)
          .join('');
        await loaded;
        const layers = data.categories.map((c, i) => {
          const id = `pm-${i}`, color = c.color[0] === '#' ? c.color : css.getPropertyValue(`--${c.color}`).trim();
          map.addSource(id, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: data.features
                .filter((f) => f.c === i)
                .map((f) => ({ type: 'Feature', properties: { t: f.t ?? '', d: f.d?.[fr ? 0 : 1] ?? '' }, geometry: { type: lines ? 'LineString' : areas ? 'Polygon' : 'Point', coordinates: f.g } })),
            },
          });
          const grow = (a, b) => ['interpolate', ['linear'], ['zoom'], 10, a, 15, b];
          map.addLayer(
            lines
              ? { id, source: id, type: 'line', layout: { 'line-cap': c.dash ? 'butt' : 'round' }, paint: { 'line-color': color, 'line-opacity': c.wide || c.dash ? 1 : 0.6, 'line-width': c.dash ? grow(3.2, 6) : c.wide ? grow(2.4, 5) : grow(1.2, 3.5), ...(c.dash ? { 'line-dasharray': [1.5, 1] } : {}) } }
              : areas
              ? { id, source: id, type: 'fill', paint: { 'fill-color': color, 'fill-opacity': 0.62, 'fill-outline-color': '#fff' } }
              : { id, source: id, type: 'circle', paint: { 'circle-radius': grow(c.hollow ? 3 : 4, c.hollow ? 8 : 10), 'circle-color': c.hollow ? '#fff' : color, 'circle-stroke-color': c.hollow ? color : '#fff', 'circle-stroke-width': c.hollow ? 3 : 1.5 } },
          );
          // Narrow shapes (streets) would vanish at city zoom: draw their outline in the category's colour too.
          if (areas && data.outline) map.addLayer({ id: `${id}-o`, source: id, type: 'line', paint: { 'line-color': color, 'line-width': grow(1.6, 2.4) } });
          return id;
        });
        const popup = new maplibregl.Popup({ closeButton: false, className: 'pm-popup', maxWidth: '240px' });
        const show = (e) => {
          const p = e.point, f = map.queryRenderedFeatures([[p.x - 5, p.y - 5], [p.x + 5, p.y + 5]], { layers }).pop(); // last = drawn on top
          map.getCanvas().style.cursor = f ? 'pointer' : '';
          if (!f) return popup.remove();
          const cat = data.categories[layers.indexOf(f.layer.id)], label = fr ? cat.fr : cat.en;
          popup
            .setLngLat(data.type === 'points' ? f.geometry.coordinates : e.lngLat)
            .setHTML(`<b>${esc(f.properties.t || label)}</b>${f.properties.d ? `<br>${esc(f.properties.d)}` : ''}${f.properties.t ? `<br><span>${esc(label)}</span>` : ''}`)
            .addTo(map);
        };
        map.on('mousemove', show);
        map.on('click', show); // touch screens
      })
      .catch(() => {
        legend.outerHTML = `<p class="note">${fr ? 'La carte n’a pas pu être chargée.' : 'The map could not be loaded.'}</p>`;
      });
  }
})();

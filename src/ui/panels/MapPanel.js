const SVG = 'http://www.w3.org/2000/svg';

/**
 * The map (pause → Peta): Pulau Seri drawn as an original illustration from `data/ui/map.json` — the island, the
 * river, Puncak Seri, the five regions with their Pelita (lit or dark from the story flags) and a firefly ring where
 * Bayu is. A list under it says the same in words for screen readers and small screens. No waypoints (GDD: the
 * island itself points the way).
 */
export class MapPanel {
  /**
   * @param {object} options
   * @param {import('../../core/I18n.js').I18n} options.i18n
   * @param {object} options.map data/ui/map.json
   * @param {() => { region: string, flags: Record<string, any> }} options.state current region and story flags
   */
  constructor({ i18n, map, state }) {
    Object.assign(this, { i18n, map, state });
    this.id = 'map';
    this.label = 'pause.map';
    this.element = document.createElement('div');
    this.element.className = 'hk-map';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', map.viewBox.join(' '));
    svg.setAttribute('class', 'hk-map__art');
    svg.setAttribute('aria-hidden', 'true');
    const path = (d, cls) => {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', cls);
      svg.appendChild(p);
    };
    path(map.island, 'hk-map__island');
    path(map.river, 'hk-map__river');
    path(map.mountain, 'hk-map__mountain');
    /** @type {Map<string, { pelita: SVGCircleElement, here: SVGCircleElement, label: SVGTextElement }>} */
    this.marks = new Map();
    for (const region of map.regions) {
      const here = document.createElementNS(SVG, 'circle');
      here.setAttribute('cx', region.x);
      here.setAttribute('cy', region.y);
      here.setAttribute('r', '13');
      here.setAttribute('class', 'hk-map__here');
      const pelita = document.createElementNS(SVG, 'circle');
      pelita.setAttribute('cx', region.x);
      pelita.setAttribute('cy', region.y);
      pelita.setAttribute('r', '6');
      const label = document.createElementNS(SVG, 'text');
      label.setAttribute('x', region.x);
      label.setAttribute('y', region.y + 22);
      label.setAttribute('class', 'hk-map__label');
      svg.append(here, pelita, label);
      this.marks.set(region.id, { pelita, here, label });
    }
    this.element.appendChild(svg);
    this.list = document.createElement('ul');
    this.list.className = 'hk-map__list';
    this.element.appendChild(this.list);
  }

  /** Read-only: no controls to move into. */
  hasControls() {
    return false;
  }

  render() {
    const t = (key) => this.i18n.t(key);
    const { region, flags } = this.state();
    this.list.replaceChildren();
    for (const r of this.map.regions) {
      const mark = this.marks.get(r.id);
      const lit = flags[r.flag] === true;
      const here = (r.scenes ?? [r.id]).includes(region);
      mark.pelita.setAttribute('class', lit ? 'hk-map__pelita is-lit' : 'hk-map__pelita');
      mark.here.style.display = here ? '' : 'none';
      mark.label.textContent = t(r.name);
      const item = document.createElement('li');
      item.className = here ? 'hk-map__item is-here' : 'hk-map__item';
      item.textContent = `${t(r.name)} — ${t(r.pelita)}: ${t(lit ? 'map.lit' : 'map.dark')}${here ? ` · ${t('map.here')}` : ''}`;
      this.list.appendChild(item);
    }
  }
}

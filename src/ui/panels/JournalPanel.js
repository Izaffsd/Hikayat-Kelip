/**
 * The journal (pause → Jurnal; GDD 10:00 "the journal opens with one line from Tok Wan's hand"): Tok Wan's lines in
 * the order they were found, the torn pages of the hikayat that have returned (each Pelita returns one), and the
 * Cahaya gathered. Read-only text; nothing here is needed to play.
 */
export class JournalPanel {
  /**
   * @param {object} options
   * @param {import('../../core/I18n.js').I18n} options.i18n
   * @param {() => { doc: any, text: (id: string) => string|null }|null} options.source save document and line texts
   */
  constructor({ i18n, source }) {
    Object.assign(this, { i18n, source });
    this.id = 'journal';
    this.label = 'pause.journal';
    this.element = document.createElement('div');
    this.element.className = 'hk-journal';
  }

  /** Read-only: no controls to move into. */
  hasControls() {
    return false;
  }

  render() {
    const t = (key, params) => this.i18n.t(key, params);
    const source = this.source();
    const doc = source?.doc;
    this.element.replaceChildren();
    const title = document.createElement('h3');
    title.className = 'hk-journal__title';
    title.textContent = t('journal.title');
    this.element.appendChild(title);
    const notes = doc?.story.journal ?? [];
    this._section(
      t('journal.notes'),
      notes.length ? notes.map((id) => source.text(id)) : [t('journal.empty')],
      true,
    );
    const pages = doc?.story.pages ?? [];
    this._section(
      t('journal.pages'),
      pages.length
        ? pages.map((n) => `${t('journal.page', { n })} — ${source.text(`page.${n}`) ?? ''}`)
        : [t('journal.noPages')],
      false,
    );
    const cahaya = document.createElement('p');
    cahaya.className = 'hk-journal__cahaya';
    cahaya.textContent = t('journal.cahaya', { n: doc?.progression.cahaya ?? 0 });
    this.element.appendChild(cahaya);
  }

  _section(heading, lines, hand) {
    const h = document.createElement('h4');
    h.className = 'hk-journal__heading';
    h.textContent = heading;
    this.element.appendChild(h);
    for (const line of lines) {
      const p = document.createElement('p');
      p.className = hand ? 'hk-journal__line hk-journal__line--hand' : 'hk-journal__line';
      p.textContent = line;
      this.element.appendChild(p);
    }
  }
}

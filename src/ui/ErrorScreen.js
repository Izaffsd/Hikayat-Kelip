/**
 * Shows a blocking, translated error message with a reload button (boot failures, missing GPU support).
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {import('../core/I18n.js').I18n} options.i18n
 * @param {string} options.titleKey
 * @param {string} options.bodyKey
 * @param {string} [options.detail] technical detail shown below (for screenshots/bug reports)
 */
export function showErrorScreen({ root, i18n, titleKey, bodyKey, detail }) {
  const section = document.createElement('section');
  section.className = 'hk-error';
  section.setAttribute('role', 'alertdialog');
  section.setAttribute('aria-labelledby', 'hk-error-title');
  section.innerHTML = `
    <div class="hk-panel hk-error__panel">
      <h2 class="hk-error__title" id="hk-error-title"></h2>
      <p class="hk-error__body"></p>
      <p class="hk-error__body hk-error__detail"></p>
      <div><button type="button" class="hk-button hk-button--primary"></button></div>
    </div>`;
  section.querySelector('.hk-error__title').textContent = i18n.t(titleKey);
  section.querySelector('.hk-error__body').textContent = i18n.t(bodyKey);
  const detailEl = /** @type {HTMLElement} */ (section.querySelector('.hk-error__detail'));
  if (detail) detailEl.textContent = detail;
  else detailEl.remove();
  const button = /** @type {HTMLButtonElement} */ (section.querySelector('button'));
  button.textContent = i18n.t('error.reload');
  button.addEventListener('click', () => location.reload());
  root.appendChild(section);
  button.focus();
}

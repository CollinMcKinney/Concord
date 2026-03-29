/**
 * Template Loader - Loads HTML templates and populates them dynamically
 */

const templates = {};

/**
 * Loads an HTML template from the views folder
 * @param {string} name - Template name (e.g., 'packets', 'users')
 * @returns {Promise<string>} HTML content
 */
async function loadTemplate(name) {
  if (templates[name]) {
    return templates[name];
  }

  try {
    const response = await fetch(`/views/${name}.html`);
    if (!response.ok) {
      throw new Error(`Template not found: ${name}`);
    }
    const html = await response.text();
    templates[name] = html;
    return html;
  } catch (error) {
    console.error(`[Template] Failed to load ${name}:`, error);
    return `<div class="empty-state"><div class="empty-state-icon">❌</div><div class="empty-state-title">Template Error</div><div class="empty-state-description">${escapeHtml(error.message)}</div></div>`;
  }
}

/**
 * Loads a template and populates the content panel
 * @param {string} name - Template name
 * @param {Function} populateFn - Function to populate the template after loading
 */
async function loadView(name, populateFn) {
  const html = await loadTemplate(name);
  const contentPanel = document.getElementById('contentPanel');
  contentPanel.innerHTML = html;
  
  if (populateFn) {
    await populateFn();
  }
}

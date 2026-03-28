/**
 * Admin Panel - Limits View
 */

async function loadLimitsView() {
  if (!permissions.canAccessView('limits')) {
    permissions.showPermissionDeniedView(document.getElementById('contentPanel'), 'limits');
    return;
  }

  try {
    const limits = await apiCall('getAllLimits');
    state.limits = limits || [];
  } catch (error) {
    console.error('[Limits] Failed to load config:', error);
    permissions.showPermissionDeniedView(document.getElementById('contentPanel'), 'limits');
    return;
  }

  await loadView('limits', renderLimitsView);
}

async function renderLimitsView() {
  const grid = document.getElementById('limits-grid');
  if (!grid) return;

  grid.innerHTML = state.limits.map(v => renderLimitCard(v)).join('');
  attachLimitsEventListeners();
}

function renderLimitCard(limitVar) {
  return `
    <div class="compact-card" data-action="edit-limit-var" data-key="${escapeHtml(limitVar.key)}" style="cursor: pointer;">
      <div class="compact-card-icon" style="background: rgba(141, 240, 181, 0.1); border-color: rgba(141, 240, 181, 0.3);">⚙️</div>
      <div class="compact-card-body" style="flex: 1;">
        <div class="compact-card-title">${escapeHtml(limitVar.label)}</div>
        <div class="compact-card-meta">
          <span class="info-pill">${escapeHtml(limitVar.key)}</span>
          <span class="info-pill">${escapeHtml(limitVar.value)}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(limitVar.help)}</div>
      </div>
      <button type="button" class="secondary-button">✏️</button>
    </div>
  `;
}

function attachLimitsEventListeners() {
  document.querySelectorAll('[data-action="edit-limit-var"]').forEach(card => {
    card.addEventListener('click', (e) => {
      const key = e.currentTarget.dataset.key;
      const limitVar = state.limits.find(v => v.key === key);
      if (limitVar) {
        openEditLimitVarModal(key, limitVar.value, limitVar.label);
      }
    });
  });
}

function openEditLimitVarModal(key, value, label) {
  document.getElementById('editLimitVarKey').value = key;
  document.getElementById('editLimitVarLabel').textContent = label;
  document.getElementById('editLimitVarValue').value = value;
  document.getElementById('editLimitVarModal').classList.add('active');
}

function closeEditLimitVarModal() {
  document.getElementById('editLimitVarModal').classList.remove('active');
}

async function saveLimitVarChange() {
  const key = document.getElementById('editLimitVarKey').value;
  const value = document.getElementById('editLimitVarValue').value.trim();

  if (!value) {
    showToast('Value cannot be empty');
    return;
  }

  try {
    await apiCall('updateLimits', [{ [key]: value }]);
    showToast('Limit updated successfully');
    closeEditLimitVarModal();
    await loadLimitsView();
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

// Export functions
window.openEditLimitVarModal = openEditLimitVarModal;
window.closeEditLimitVarModal = closeEditLimitVarModal;
window.saveLimitVarChange = saveLimitVarChange;

/**
 * Admin Panel - Prefixes and Command Roles Views
 */

// =====================
// Message Suppression View
// =====================
async function loadPrefixesView() {
  if (!permissions.canAccessView('prefixes')) {
    permissions.showPermissionDeniedView(document.getElementById('contentPanel'), 'prefixes');
    return;
  }

  const prefixes = await apiCall('getSuppressedPrefixes');
  state.prefixes = prefixes || [];

  await loadView('prefixes', renderPrefixesView);
}

async function renderPrefixesView() {
  const container = document.getElementById('prefixes-list');
  if (!container) return;

  if (state.prefixes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🚫</div>
        <div class="empty-state-title">No Suppressed Strings</div>
        <div class="empty-state-description">Messages containing any of the configured strings will not be bridged.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.prefixes.map((prefix, index) => `
    <div class="compact-card">
      <div class="compact-card-icon" style="background: rgba(153, 255, 194, 0.1);">🚫</div>
      <div class="compact-card-body">
        <div class="compact-card-title">${escapeHtml(prefix)}</div>
        <div class="compact-card-meta">
          <span class="compact-badge compact-badge-status">Suppressed</span>
          <span class="tooltip" data-tip="Messages containing this string will not be bridged">
            <span class="info-pill">ℹ️ Contains check</span>
          </span>
        </div>
      </div>
      <div class="compact-card-actions">
        <button type="button" class="danger-button" data-action="delete-prefix" data-prefix="${escapeHtml(prefix)}" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openAddPrefixModal() {
  document.getElementById('addPrefixValue').value = '';
  document.getElementById('addPrefixModal').classList.add('active');
}

function closeAddPrefixModal() {
  document.getElementById('addPrefixModal').classList.remove('active');
}

async function addPrefix() {
  const value = document.getElementById('addPrefixValue').value.trim();
  if (!value) {
    showToast('Please enter a value');
    return;
  }

  try {
    const prefixes = await apiCall('setSuppressedPrefixes', [...state.prefixes, value]);
    state.prefixes = prefixes;
    showToast('Prefix added successfully');
    closeAddPrefixModal();
    await loadPrefixesView();
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

async function deletePrefix(prefix) {
  try {
    const prefixes = await apiCall('setSuppressedPrefixes', state.prefixes.filter(p => p !== prefix));
    state.prefixes = prefixes;
    showToast('Prefix deleted successfully');
    await loadPrefixesView();
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

// =====================
// Command Roles View
// =====================
async function loadCommandRolesView() {
  if (!permissions.canAccessView('commandRoles')) {
    permissions.showPermissionDeniedView(document.getElementById('contentPanel'), 'commandRoles');
    return;
  }

  const roles = await apiCall('getCommandRoleRequirements');
  state.commandRoles = roles || {};

  await loadView('commandRoles', renderCommandRolesView);
}

async function renderCommandRolesView() {
  const container = document.getElementById('command-roles-list');
  if (!container) return;

  container.innerHTML = Object.entries(state.commandRoles).map(([cmd, roleData]) => {
    const roleName = roleData.roleName || 'OPEN';
    const roleValue = roleData.roleValue;
    const roleColor = getRoleColor(roleValue);
    return `
      <div class="compact-card">
        <div class="compact-card-icon" style="background: rgba(141, 240, 181, 0.1);">⚙️</div>
        <div class="compact-card-body">
          <div class="compact-card-title">${escapeHtml(cmd)}</div>
          <div class="compact-card-meta">
            <span class="compact-badge compact-badge-role" style="background: ${roleColor}30; color: ${roleColor};">${escapeHtml(roleName)}</span>
            ${roleData.overridden ? '<span class="compact-badge compact-badge-status">Overridden</span>' : '<span class="compact-badge compact-badge-status">Default</span>'}
            <span class="tooltip" data-tip="Minimum role required to execute this command">
              <span class="info-pill">ℹ️ Role requirement</span>
            </span>
          </div>
        </div>
        <div class="compact-card-actions">
          <button type="button" class="secondary-button" data-action="edit-command-role" data-command="${escapeHtml(cmd)}" data-role="${roleValue}">✏️ Edit</button>
        </div>
      </div>
    `;
  }).join('');
}

function openEditCommandRoleModal(command, role) {
  document.getElementById('editCommandRoleCommand').value = command;
  document.getElementById('editCommandRoleSelect').value = role != null ? role.toString() : 'null';
  document.getElementById('editCommandRoleModal').classList.add('active');
}

function closeEditCommandRoleModal() {
  document.getElementById('editCommandRoleModal').classList.remove('active');
}

async function saveCommandRoleChange() {
  const command = document.getElementById('editCommandRoleCommand').value;
  const roleValue = document.getElementById('editCommandRoleSelect').value;
  const role = roleValue === 'null' ? null : parseInt(roleValue, 10);

  try {
    await apiCall('setCommandRoleRequirement', [command, role]);
    showToast('Command role updated successfully');
    closeEditCommandRoleModal();
    await loadCommandRolesView();
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

function getRoleColor(role) {
  const colors = {
    0: '#ff8585',  // BLOCKED
    1: '#a0a0a0',  // GUEST
    2: '#8df0b5',  // MEMBER
    3: '#85c7ff',  // MODERATOR
    4: '#ffd785',  // ADMIN
    5: '#ff85f0',  // OWNER
    6: '#ff4757'   // ROOT
  };
  return colors[role] || '#8df0b5';
}

function openChangePasswordModal() {
  document.getElementById('changePasswordUsername').value = '';
  document.getElementById('changePasswordCurrent').value = '';
  document.getElementById('changePasswordNew').value = '';
  document.getElementById('changePasswordConfirm').value = '';
  document.getElementById('changePasswordModal').classList.add('active');
}

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.remove('active');
}

async function savePasswordChange() {
  const username = document.getElementById('changePasswordUsername').value.trim();
  const currentPassword = document.getElementById('changePasswordCurrent').value;
  const newPassword = document.getElementById('changePasswordNew').value;
  const confirmPassword = document.getElementById('changePasswordConfirm').value;

  if (!username || !currentPassword || !newPassword || !confirmPassword) {
    showToast('Please fill in all fields');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match');
    return;
  }

  try {
    // First verify current password
    const authResult = await apiCall('authenticate', [username, currentPassword]);
    if (!authResult) {
      showToast('Current password is incorrect');
      return;
    }

    // Change the password
    await apiCall('changePassword', [username, newPassword]);
    showToast('Password changed successfully');
    closeChangePasswordModal();
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

// Export functions
window.openAddPrefixModal = openAddPrefixModal;
window.closeAddPrefixModal = closeAddPrefixModal;
window.addPrefix = addPrefix;
window.deletePrefix = deletePrefix;
window.openEditCommandRoleModal = openEditCommandRoleModal;
window.closeEditCommandRoleModal = closeEditCommandRoleModal;
window.saveCommandRoleChange = saveCommandRoleChange;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.savePasswordChange = savePasswordChange;

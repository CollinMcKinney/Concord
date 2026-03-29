/**
 * Admin Panel - Modals
 * Modal close functions and modal loader
 */

// ===== Modal Close Functions (defined first for hoisting) =====

function closeViewJsonModal() {
  document.getElementById('viewJsonModal').classList.remove('active');
}

function copyViewJson() {
  const content = document.getElementById('viewJsonContent').textContent;
  navigator.clipboard.writeText(content).then(() => {
    showToast('JSON copied to clipboard');
  }).catch(err => {
    showToast('Failed to copy JSON');
  });
}

// closeCredentialsModal is defined in credentials.js with authentication logic

function closePacketModal() {
  console.log('[Modals] Closing packet modal');
  document.getElementById('packetModal').classList.remove('active');
}

function closeSetRoleModal() {
  document.getElementById('setRoleModal').classList.remove('active');
}

function closeAddPrefixModal() {
  document.getElementById('addPrefixModal').classList.remove('active');
}

function closeEditCommandRoleModal() {
  document.getElementById('editCommandRoleModal').classList.remove('active');
}

function closeUploadFileModal() {
  document.getElementById('uploadFileModal').classList.remove('active');
}

function closePreviewFileModal() {
  document.getElementById('previewFileModal').classList.remove('active');
}

function closeAddCategoryModal() {
  document.getElementById('addCategoryModal').classList.remove('active');
}

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.remove('active');
}

function closeResetPasswordModal() {
  document.getElementById('resetPasswordModal').classList.remove('active');
}

function closeAddMimeTypeModal() {
  document.getElementById('addMimeTypeModal').classList.remove('active');
}

function closeEditEnvVarModal() {
  document.getElementById('editEnvVarModal').classList.remove('active');
}

function closeEditDiscordSettingModal() {
  document.getElementById('editDiscordSettingModal').classList.remove('active');
}

// ===== Export Functions Immediately =====

window.closeViewJsonModal = closeViewJsonModal;
window.copyViewJson = copyViewJson;
// closeCredentialsModal is exported by credentials.js
window.closePacketModal = closePacketModal;
window.closeSetRoleModal = closeSetRoleModal;
window.closeAddPrefixModal = closeAddPrefixModal;
window.closeEditCommandRoleModal = closeEditCommandRoleModal;
window.closeUploadFileModal = closeUploadFileModal;
window.closePreviewFileModal = closePreviewFileModal;
window.closeAddCategoryModal = closeAddCategoryModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.closeResetPasswordModal = closeResetPasswordModal;
window.closeAddMimeTypeModal = closeAddMimeTypeModal;
window.closeEditEnvVarModal = closeEditEnvVarModal;
window.closeEditDiscordSettingModal = closeEditDiscordSettingModal;

// ===== Modal Loader =====

const MODAL_FILES = [
  'credentials.html', 'packet.html', 'set-role.html', 'add-prefix.html',
  'edit-command-role.html', 'upload-file.html', 'preview-file.html',
  'add-category.html', 'edit-limit.html', 'view-json.html',
  'change-password.html', 'reset-password.html', 'add-mime-type.html',
  'edit-discord-setting.html'
];

window.loadModals = async function() {
  try {
    const container = document.getElementById('modalsContainer');
    if (!container) return;

    const modalPromises = MODAL_FILES.map(async (file) => {
      const response = await fetch(`/modals/${file}`);
      return response.ok ? await response.text() : '';
    });

    const modals = await Promise.all(modalPromises);
    container.innerHTML = modals.join('\n');
    console.log('[Modals] Loaded', MODAL_FILES.length, 'modal files');

    // Attach event listeners after modals are loaded
    if (window.attachModalEventListeners) {
      window.attachModalEventListeners();
    }
    if (window.attachDiscordSettingModalListeners) {
      window.attachDiscordSettingModalListeners();
    }
  } catch (error) {
    console.error('Failed to load modals:', error);
  }
};

// Auto-load modals on page load
document.addEventListener('DOMContentLoaded', () => {
  window.loadModals();
});

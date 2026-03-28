/**
 * Admin Panel - Discord View
 */

async function loadDiscordView() {
  const identifier = document.getElementById('rootCredentials').value.trim();
  const hasCredential = document.getElementById('rootPassword').value.length > 0 || sessionStorage.getItem('sessionToken');
  if (!identifier || !hasCredential) {
    showCredentialsRequiredView('discord');
    return;
  }

  if (!permissions.canAccessView('discord')) {
    permissions.showPermissionDeniedView(document.getElementById('contentPanel'), 'discord');
    return;
  }

  try {
    const status = await apiCall('getDiscordStatus');
    state.discordStatus = status || { isConnected: false, isConfigured: false };
  } catch (error) {
    console.error('[Discord] Failed to load status:', error);
    permissions.showPermissionDeniedView(document.getElementById('contentPanel'), 'discord');
    return;
  }

  await loadView('discord', renderDiscordView);
}

async function renderDiscordView() {
  const status = state.discordStatus;
  
  // Update status indicator
  const statusDot = document.getElementById('discord-status-dot');
  const statusText = document.getElementById('discord-status-text');
  if (statusDot && statusText) {
    statusDot.style.background = status.isConnected ? '#8df0b5' : '#ff8585';
    statusDot.style.boxShadow = `0 0 8px ${status.isConnected ? 'rgba(141, 240, 181, 0.8)' : 'rgba(255, 133, 133, 0.8)'}`;
    statusText.textContent = status.isConnected ? 'Connected' : 'Disconnected';
  }

  renderDiscordSettings('discord-developer-settings', [
    { label: 'Bot Token', value: status.botToken, action: 'edit-bot-token', icon: '🔑', help: 'Developer Portal → Bot → Reset Token' },
    { label: 'Client ID', value: status.clientId, action: 'edit-client-id', icon: '🆔', help: 'Developer Portal → OAuth2' },
    { label: 'Client Secret', value: status.clientSecret, action: 'edit-client-secret', icon: '🔐', help: 'Developer Portal → OAuth2 → Reset Secret' },
    { label: 'Redirect URI', value: status.redirectUri, action: 'edit-redirect-uri', icon: '🔀', help: 'Developer Portal → OAuth2 → Add Redirect' },
    { label: 'Permissions', value: status.permissionsInteger, action: 'edit-permissions', icon: '⚙️', help: 'Developer Portal → Bot → Permissions' }
  ]);

  renderDiscordSettings('discord-bot-settings', [
    { label: 'Channel ID', value: status.channelId, action: 'edit-channel-id', icon: '💬', help: 'Discord → Right-click channel → Copy ID' },
    { label: 'Webhook URL', value: status.webhookUrl, action: 'edit-webhook-url', icon: '🔗', help: 'Discord → Channel → Integrations → Webhooks' }
  ]);

  renderDiscordSettings('discord-guild-settings', [
    { label: 'Discord Invite URL', value: status.discordInviteUrl, action: 'edit-discord-invite-url', icon: '🏰', help: 'Discord Server → Invite Settings' }
  ]);
}

function renderDiscordSettings(containerId, settings) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = settings.map(s => `
    <div class="compact-card" style="margin-bottom: 12px;">
      <div class="compact-card-icon" style="background: rgba(141, 240, 181, 0.1); border-color: rgba(141, 240, 181, 0.3);">${s.icon}</div>
      <div class="compact-card-body" style="flex: 1;">
        <div class="compact-card-title">${s.label}</div>
        <div class="compact-card-meta"><span class="info-pill">${s.value || 'Not configured'}</span></div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">${s.help}</div>
      </div>
      <button type="button" class="secondary-button" data-action="${s.action}">✏️ Edit</button>
    </div>
  `).join('');
}

async function handleDiscordToggle() {
  const status = state.discordStatus;
  try {
    if (status.isConnected) {
      await apiCall('stopDiscord');
    } else {
      await apiCall('startDiscord');
    }
    const newStatus = await apiCall('getDiscordStatus');
    state.discordStatus = newStatus;
    await renderDiscordView();
  } catch (error) {
    console.error('[Discord] Toggle failed:', error);
    showToast(`Error: ${error.message}`);
  }
}

/**
 * Admin Panel - Packets View
 */

async function loadPacketsView() {
  // Check if credentials are set
  const identifier = document.getElementById('rootCredentials').value.trim();
  const hasCredential = document.getElementById('rootPassword').value.length > 0 || sessionStorage.getItem('sessionToken');
  if (!identifier || !hasCredential) {
    permissions.showPermissionDeniedView(document.getElementById('contentPanel'), 'auditLogs');
    return;
  }

  await loadView('packets', renderPacketsView);
}

async function renderPacketsView() {
  const packets = await apiCall('getPackets', [50]);
  state.packets = packets || [];
  state.packetsCurrentCategory = state.packetsCurrentCategory || 'all';
  state.packetsCurrentSubcategory = state.packetsCurrentSubcategory || 'all';

  // Build category and subcategory counts
  const categoryCounts = {};
  const subcategoryCounts = {};

  for (const packet of state.packets) {
    const type = packet.type || 'unknown';
    const parts = type.split('.');
    const category = parts[0];
    const subcategory = parts.length > 1 ? parts[1] : null;

    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    if (subcategory) {
      const key = `${category}.${subcategory}`;
      subcategoryCounts[key] = (subcategoryCounts[key] || 0) + 1;
    }
  }

  // Filter packets
  let filteredPackets = state.packets;
  if (state.packetsCurrentCategory !== 'all') {
    filteredPackets = filteredPackets.filter(p => {
      const type = p.type || 'unknown';
      return type.startsWith(state.packetsCurrentCategory + '.') || type === state.packetsCurrentCategory;
    });
  }
  if (state.packetsCurrentSubcategory !== 'all') {
    const fullType = `${state.packetsCurrentCategory}.${state.packetsCurrentSubcategory}`;
    filteredPackets = filteredPackets.filter(p => p.type === fullType);
  }
  if (state.packetsSearchQuery) {
    const query = state.packetsSearchQuery.toLowerCase();
    filteredPackets = filteredPackets.filter(p => {
      const body = (p.data?.body || '').toLowerCase();
      const actor = (p.actor?.name || '').toLowerCase();
      const origin = (p.origin || '').toLowerCase();
      const type = (p.type || '').toLowerCase();
      return body.includes(query) || actor.includes(query) || origin.includes(query) || type.includes(query);
    });
  }

  // Update UI
  document.getElementById('packets-total-count').textContent = `${state.packets.length} total`;
  renderPacketsCategoryTabs(categoryCounts);
  renderPacketsSubcategoryTabs(categoryCounts, subcategoryCounts);
  renderPacketsResults(filteredPackets, categoryCounts, subcategoryCounts);
}

function renderPacketsCategoryTabs(categoryCounts) {
  const container = document.getElementById('packets-category-tabs');
  const uniqueCategories = Object.keys(categoryCounts).sort();
  
  let html = `
    <button type="button" class="secondary-button" data-action="set-packets-category" data-category="all"
      style="background: ${state.packetsCurrentCategory === 'all' ? 'rgba(141, 240, 181, 0.2)' : 'transparent'}; border-color: ${state.packetsCurrentCategory === 'all' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)'}">
      📋 All (${state.packets.length})
    </button>
    ${uniqueCategories.map(cat => `
      <button type="button" class="secondary-button" data-action="set-packets-category" data-category="${cat}"
        style="background: ${state.packetsCurrentCategory === cat ? 'rgba(141, 240, 181, 0.2)' : 'transparent'}; border-color: ${state.packetsCurrentCategory === cat ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)'}">
        ${getCategoryEmoji(cat)} ${cat} (${categoryCounts[cat]})
      </button>
    `).join('')}
  `;
  
  container.innerHTML = html;
}

function renderPacketsSubcategoryTabs(categoryCounts, subcategoryCounts) {
  const container = document.getElementById('packets-subcategory-tabs');
  const currentSubcategories = state.packetsCurrentCategory !== 'all'
    ? Object.keys(subcategoryCounts)
        .filter(k => k.startsWith(state.packetsCurrentCategory + '.'))
        .map(k => k.replace(state.packetsCurrentCategory + '.', ''))
        .sort()
    : [];

  if (state.packetsCurrentCategory === 'all' || currentSubcategories.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  let html = `
    <button type="button" class="secondary-button" data-action="set-packets-subcategory" data-subcategory="all"
      style="font-size: 0.85rem; background: ${state.packetsCurrentSubcategory === 'all' ? 'rgba(141, 240, 181, 0.2)' : 'transparent'}; border-color: ${state.packetsCurrentSubcategory === 'all' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)'}">
      All (${subcategoryCounts[`${state.packetsCurrentCategory}.${state.packetsCurrentSubcategory}`] || state.packets.length})
    </button>
    ${currentSubcategories.map(sub => `
      <button type="button" class="secondary-button" data-action="set-packets-subcategory" data-subcategory="${sub}"
        style="font-size: 0.85rem; background: ${state.packetsCurrentSubcategory === sub ? 'rgba(141, 240, 181, 0.2)' : 'transparent'}; border-color: ${state.packetsCurrentSubcategory === sub ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)'}">
        ${sub} (${subcategoryCounts[`${state.packetsCurrentCategory}.${sub}`] || 0})
      </button>
    `).join('')}
  `;
  
  container.innerHTML = html;
}

function renderPacketsResults(filteredPackets, categoryCounts, subcategoryCounts) {
  const container = document.getElementById('packets-results');
  const currentSubcategories = state.packetsCurrentCategory !== 'all'
    ? Object.keys(subcategoryCounts)
        .filter(k => k.startsWith(state.packetsCurrentCategory + '.'))
        .map(k => k.replace(state.packetsCurrentCategory + '.', ''))
        .sort()
    : [];

  if (filteredPackets.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <div class="empty-state-title">No Packets</div>
        <div class="empty-state-description">No packets found matching your criteria.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${filteredPackets.slice(0, 20).map(packet => renderPacketCard(packet)).join('')}
  `;
}

function handlePacketsSearch(inputElement) {
  state.packetsSearchQuery = inputElement.value;
  
  // Get filtered packets
  let filteredPackets = state.packets;
  if (state.packetsCurrentCategory !== 'all') {
    filteredPackets = filteredPackets.filter(p => {
      const type = p.type || 'unknown';
      return type.startsWith(state.packetsCurrentCategory + '.') || type === state.packetsCurrentCategory;
    });
  }
  if (state.packetsCurrentSubcategory !== 'all') {
    const fullType = `${state.packetsCurrentCategory}.${state.packetsCurrentSubcategory}`;
    filteredPackets = filteredPackets.filter(p => p.type === fullType);
  }
  if (state.packetsSearchQuery) {
    const query = state.packetsSearchQuery.toLowerCase();
    filteredPackets = filteredPackets.filter(p => {
      const body = (p.data?.body || '').toLowerCase();
      const actor = (p.actor?.name || '').toLowerCase();
      const origin = (p.origin || '').toLowerCase();
      const type = (p.type || '').toLowerCase();
      return body.includes(query) || actor.includes(query) || origin.includes(query) || type.includes(query);
    });
  }

  // Build category and subcategory counts
  const categoryCounts = {};
  const subcategoryCounts = {};
  for (const packet of state.packets) {
    const type = packet.type || 'unknown';
    const parts = type.split('.');
    const category = parts[0];
    const subcategory = parts.length > 1 ? parts[1] : null;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (subcategory) {
      const key = `${category}.${subcategory}`;
      subcategoryCounts[key] = (subcategoryCounts[key] || 0) + 1;
    }
  }

  const uniqueCategories = Object.keys(categoryCounts).sort();
  const currentSubcategories = state.packetsCurrentCategory !== 'all'
    ? uniqueCategories
        .filter(c => c === state.packetsCurrentCategory)
        .flatMap(cat => {
          return Object.keys(subcategoryCounts)
            .filter(k => k.startsWith(cat + '.'))
            .map(k => k.replace(cat + '.', ''));
        })
        .sort()
    : [];

  // Only update the results container, not the entire view
  const resultsContainer = document.getElementById('packetsResults');
  if (resultsContainer) {
    resultsContainer.innerHTML = renderPacketsResults(filteredPackets, state.packetsCurrentCategory, currentSubcategories, subcategoryCounts, uniqueCategories);
  }
}

function setPacketsCategory(category) {
  state.packetsCurrentCategory = category;
  state.packetsCurrentSubcategory = 'all';
  loadPacketsView();
}

function setPacketsSubcategory(subcategory) {
  state.packetsCurrentSubcategory = subcategory;
  loadPacketsView();
}

function getCategoryEmoji(category) {
  const emojis = {
    'chat': '💬',
    'auth': '🔐',
    'config': '⚙️'
  };
  return emojis[category] || '📦';
}

function renderPacketCard(packet) {
  const ts = new Date(packet.timestamp);
  return `
    <div class="compact-card" data-packet-id="${escapeHtml(packet.id)}">
      <div class="compact-card-icon" title="Packet type: ${escapeHtml(packet.type)}">📦</div>
      <div class="compact-card-body">
        <div class="compact-card-title">${escapeHtml(packet.actor.name || 'Unknown')}</div>
        <div class="compact-card-meta">
          <span class="compact-badge compact-badge-type">${escapeHtml(packet.type)}</span>
          <span class="compact-badge compact-badge-origin">${escapeHtml(packet.origin)}</span>
          <span class="info-pill">🕐 ${escapeHtml(ts.toLocaleTimeString())}</span>
          <span class="info-pill">📅 ${escapeHtml(ts.toLocaleDateString())}</span>
        </div>
        <div class="compact-card-meta" style="margin-top: 4px;">
          <span class="tooltip" data-tip="${escapeHtml(packet.data.body || 'No content')}">
            <span class="tooltip-icon">?</span>
            <span style="color: var(--muted); font-size: 0.75rem; margin-left: 4px;">Preview content (hover)</span>
          </span>
        </div>
      </div>
      <div class="compact-card-actions">
        <button type="button" class="secondary-button" data-action="view-packet" title="View details">👁️</button>
        <button type="button" class="secondary-button" data-action="edit-packet" title="Edit">✏️</button>
        <button type="button" class="danger-button" data-action="delete-packet" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

async function loadPacketDetailView() {
  if (!state.selectedPacket) {
    navigateTo('packets');
    return;
  }

  const packet = state.selectedPacket;
  const ts = new Date(packet.timestamp);

  const contentPanel = document.getElementById('contentPanel');
  contentPanel.innerHTML = `
    <div class="content-panel-header">
      <h2 class="content-panel-title">📦 Packet Details</h2>
      <div class="content-panel-actions">
        <button type="button" class="secondary-button" data-action="back-to-packets" title="Go back to packets list">← Back</button>
        <button type="button" class="primary-button" data-action="edit-packet-detail" data-packet-id="${escapeHtml(packet.id)}" data-packet-content="${escapeHtml(packet.data.body || '')}" title="Edit this packet">✏️ Edit</button>
        <button type="button" class="danger-button" data-action="delete-packet-detail" data-packet-id="${escapeHtml(packet.id)}" title="Delete this packet">🗑️ Delete</button>
      </div>
    </div>
    <div class="content-panel-body">
      <div class="compact-card" style="display: block;">
        <div class="compact-card-body">
          <div class="compact-card-meta" style="margin-bottom: 12px;">
            <span class="compact-badge compact-badge-type">${escapeHtml(packet.type)}</span>
            <span class="compact-badge compact-badge-origin">${escapeHtml(packet.origin)}</span>
            <span class="compact-badge compact-badge-status">ID: ${escapeHtml(packet.id.slice(-8))}</span>
          </div>
          <div class="field">
            <label>Author</label>
            <div style="color: var(--text); font-size: 0.95rem;">${escapeHtml(packet.actor.name || 'Unknown')}</div>
          </div>
          <div class="field">
            <label>Timestamp</label>
            <div style="color: var(--text); font-size: 0.95rem;">${escapeHtml(ts.toLocaleString())}</div>
          </div>
          <div class="field">
            <label>Content</label>
            <div style="color: var(--text); font-size: 0.95rem; white-space: pre-wrap;">${escapeHtml(packet.data.body || 'No content')}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openAddPacketModal() {
  document.getElementById('packetModalTitle').textContent = '📦 Add Packet';
  document.getElementById('packetModalId').value = '';
  document.getElementById('packetType').value = 'chat.message';
  document.getElementById('packetOrigin').value = 'admin';
  document.getElementById('packetBody').value = '';
  document.getElementById('packetMeta').value = '';
  document.getElementById('packetAttachments').value = '';
  document.getElementById('packetModal').classList.add('active');
}

function closePacketModal() {
  document.getElementById('packetModal').classList.remove('active');
}

function openEditPacketModal(packetId, packet) {
  document.getElementById('packetModalTitle').textContent = '✏️ Edit Packet';
  document.getElementById('packetModalId').value = packetId;
  document.getElementById('packetType').value = packet.type || 'chat.message';
  document.getElementById('packetOrigin').value = packet.origin || '';
  document.getElementById('packetBody').value = packet.data?.body || '';
  document.getElementById('packetMeta').value = packet.meta ? JSON.stringify(packet.meta, null, 2) : '';
  document.getElementById('packetAttachments').value = packet.data?.attachments ? JSON.stringify(packet.data.attachments, null, 2) : '';
  document.getElementById('packetModal').classList.add('active');
}

async function savePacket() {
  const packetId = document.getElementById('packetModalId').value;
  const packetType = document.getElementById('packetType').value;
  const origin = document.getElementById('packetOrigin').value;
  const body = document.getElementById('packetBody').value;
  
  let meta = {};
  try {
    const metaStr = document.getElementById('packetMeta').value.trim();
    if (metaStr) meta = JSON.parse(metaStr);
  } catch (e) {
    showToast('Invalid JSON in metadata');
    return;
  }
  
  let attachments = [];
  try {
    const attachmentsStr = document.getElementById('packetAttachments').value.trim();
    if (attachmentsStr) attachments = JSON.parse(attachmentsStr);
  } catch (e) {
    showToast('Invalid JSON in attachments');
    return;
  }
  
  try {
    if (packetId) {
      // Edit existing packet
      await apiCall('editPacket', [packetId, body]);
      showToast('Packet updated');
    } else {
      // Add new packet with full data
      const packetData = {
        body,
        attachments: attachments.length > 0 ? attachments : undefined
      };
      await apiCall('addPacket', [body, {}, origin, { ...meta, type: packetType, attachments }]);
      showToast('Packet added');
    }
    closePacketModal();
    loadCurrentView();
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

// Make functions globally accessible
window.openAddPacketModal = openAddPacketModal;
window.closePacketModal = closePacketModal;
window.openEditPacketModal = openEditPacketModal;
window.savePacket = savePacket;
window.loadPacketDetailView = loadPacketDetailView;
window.handlePacketsSearch = handlePacketsSearch;
window.setPacketsCategory = setPacketsCategory;
window.setPacketsSubcategory = setPacketsSubcategory;

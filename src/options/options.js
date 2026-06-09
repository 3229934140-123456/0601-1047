let editingSiteId = null;

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function switchSection(sectionId) {
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });
  document.querySelectorAll('.settings-section').forEach(section => {
    section.style.display = section.id === 'section-' + sectionId ? 'block' : 'none';
  });
}

async function loadSettings() {
  const settings = await getSettings();
  document.getElementById('set-autodetect').checked = settings.autoDetect !== false;
  document.getElementById('set-overlay').checked = settings.showOverlay !== false;
  document.getElementById('set-notifications').checked = settings.notificationEnabled !== false;
  document.getElementById('set-privacy').checked = settings.privacyMode === true;
  document.getElementById('set-reminder-time').value = settings.reminderTime || '20:00';
  document.getElementById('export-format').value = settings.exportFormat || 'json';
}

async function saveSetting(key, value) {
  const settings = await getSettings();
  settings[key] = value;
  await saveSettings(settings);
}

async function loadSiteRules() {
  const rules = await getSiteRules();
  const container = document.getElementById('site-list');
  container.innerHTML = rules.map(rule => `
    <div class="site-item" data-id="${rule.id}">
      <div class="site-item-icon">🌐</div>
      <div class="site-item-info">
        <div class="site-item-name">${rule.name}</div>
        <div class="site-item-match">${(rule.match || []).join(', ')}</div>
      </div>
      <div class="site-item-actions">
        <span class="site-status ${rule.enabled ? 'enabled' : ''}">${rule.enabled ? '已启用' : '已禁用'}</span>
        <button class="site-item-btn" data-action="edit" title="编辑">✏️</button>
        <button class="site-item-btn" data-action="toggle" title="启用/禁用">${rule.enabled ? '⏸️' : '▶️'}</button>
        <button class="site-item-btn danger" data-action="delete" title="删除">🗑️</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.site-item').forEach(item => {
    const id = item.dataset.id;
    item.querySelector('[data-action="edit"]').addEventListener('click', () => editSiteRule(id));
    item.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleSiteRule(id));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSiteRule(id));
  });
}

function openSiteModal(rule = null) {
  editingSiteId = rule?.id || null;
  document.getElementById('site-modal-title').textContent = rule ? '编辑站点规则' : '添加自定义站点';
  document.getElementById('site-name').value = rule?.name || '';
  document.getElementById('site-match').value = (rule?.match || []).join(', ');
  document.getElementById('site-title-selector').value = rule?.titleSelector || '';
  document.getElementById('site-episode-selector').value = rule?.episodeSelector || '';
  document.getElementById('site-progress-selector').value = rule?.progressSelector || 'video';
  document.getElementById('site-enabled').checked = rule?.enabled !== false;
  document.getElementById('site-modal').style.display = 'flex';
}

function closeSiteModal() {
  document.getElementById('site-modal').style.display = 'none';
  editingSiteId = null;
}

async function saveSiteRule() {
  const name = document.getElementById('site-name').value.trim();
  const matchStr = document.getElementById('site-match').value.trim();
  const titleSelector = document.getElementById('site-title-selector').value.trim();
  const episodeSelector = document.getElementById('site-episode-selector').value.trim();
  const progressSelector = document.getElementById('site-progress-selector').value.trim() || 'video';
  const enabled = document.getElementById('site-enabled').checked;

  if (!name || !matchStr) {
    showToast('请填写站点名称和域名匹配');
    return;
  }

  const rules = await getSiteRules();
  const match = matchStr.split(',').map(m => m.trim()).filter(Boolean);

  if (editingSiteId) {
    const index = rules.findIndex(r => r.id === editingSiteId);
    if (index !== -1) {
      rules[index] = { ...rules[index], name, match, titleSelector, episodeSelector, progressSelector, enabled };
    }
  } else {
    rules.push({
      id: Date.now().toString(36),
      name,
      match,
      titleSelector,
      episodeSelector,
      progressSelector,
      enabled,
      custom: true
    });
  }

  await saveSiteRules(rules);
  await loadSiteRules();
  closeSiteModal();
  showToast(editingSiteId ? '已更新站点规则' : '已添加站点规则');
}

async function editSiteRule(id) {
  const rules = await getSiteRules();
  const rule = rules.find(r => r.id === id);
  if (rule) openSiteModal(rule);
}

async function toggleSiteRule(id) {
  const rules = await getSiteRules();
  const index = rules.findIndex(r => r.id === id);
  if (index !== -1) {
    rules[index].enabled = !rules[index].enabled;
    await saveSiteRules(rules);
    await loadSiteRules();
  }
}

async function deleteSiteRule(id) {
  if (!confirm('确定要删除这个站点规则吗？')) return;
  const rules = await getSiteRules();
  const filtered = rules.filter(r => r.id !== id);
  await saveSiteRules(filtered);
  await loadSiteRules();
  showToast('已删除站点规则');
}

async function loadReminders() {
  const items = await getItems();
  const container = document.getElementById('reminders-list');
  const allReminders = [];
  items.forEach(item => {
    (item.reminders || []).forEach(rem => {
      allReminders.push({ ...rem, itemId: item.id, itemTitle: item.title });
    });
  });
  allReminders.sort((a, b) => a.time - b.time);

  if (!allReminders.length) {
    container.innerHTML = '<div class="empty-reminders">暂无提醒设置</div>';
    return;
  }

  const now = Date.now();
  container.innerHTML = allReminders.map(rem => {
    const isPast = rem.time < now;
    return `
      <div class="reminder-item" style="${isPast ? 'opacity:0.5' : ''}">
        <span class="reminder-item-icon">${isPast ? '⏰' : '⏳'}</span>
        <div class="reminder-item-info">
          <div class="reminder-item-title">${rem.itemTitle}</div>
          <div class="reminder-item-time">${new Date(rem.time).toLocaleString('zh-CN')}${isPast ? ' (已过期)' : ''}</div>
        </div>
        <button class="reminder-item-remove" data-item="${rem.itemId}" data-reminder="${rem.id}" title="删除">×</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.reminder-item-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.item;
      const reminderId = btn.dataset.reminder;
      const item = await getItemById(itemId);
      if (item) {
        item.reminders = (item.reminders || []).filter(r => r.id !== reminderId);
        await updateItem(itemId, { reminders: item.reminders });
        await loadReminders();
        showToast('已删除提醒');
      }
    });
  });
}

async function exportDataAction() {
  const format = document.getElementById('export-format').value;
  const data = await exportData(format);
  const now = new Date();
  const filename = `media-tracker-${formatDate(now.getTime())}.${format}`;

  const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  await saveSetting('exportFormat', format);
  showToast('数据已导出');
}

function importDataAction() {
  document.getElementById('import-file').click();
}

async function handleImportFile(file) {
  if (!confirm('导入将覆盖现有数据，确定继续吗？')) return;

  try {
    const text = await file.text();
    const success = await importData(text);
    if (success) {
      showToast('数据导入成功');
      await loadSettings();
      await loadSiteRules();
    } else {
      showToast('导入失败：文件格式错误');
    }
  } catch (e) {
    showToast('导入失败：' + e.message);
  }
}

async function clearAllData() {
  if (!confirm('⚠️ 确定要清除所有数据吗？此操作不可恢复！')) return;
  if (!confirm('再次确认：所有收藏、设置、历史记录都将被删除！')) return;

  await chrome.storage.local.clear();
  showToast('所有数据已清除');
  setTimeout(() => location.reload(), 1000);
}

async function viewHistory() {
  const history = await getHistory();
  const container = document.getElementById('history-list');

  if (!history.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">暂无历史记录</div>';
  } else {
    const typeIcons = { add: '➕', update: '✏️', delete: '🗑️' };
    const typeLabels = { add: '添加', update: '更新', delete: '删除' };
    container.innerHTML = history.map(h => `
      <div class="history-item">
        <span class="history-item-icon">${typeIcons[h.type] || '📝'}</span>
        <div class="history-item-content">
          <div class="history-item-title">${typeLabels[h.type] || '操作'}：${h.itemTitle || '未命名'}</div>
          <div class="history-item-time">${formatDateTime(h.timestamp)}</div>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('history-modal').style.display = 'flex';
}

async function clearHistory() {
  if (!confirm('确定要清除所有历史记录吗？')) return;
  await clearHistory();
  showToast('历史记录已清除');
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadSiteRules();
  await loadReminders();

  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => switchSection(item.dataset.section));
  });

  document.getElementById('set-autodetect').addEventListener('change', (e) => saveSetting('autoDetect', e.target.checked));
  document.getElementById('set-overlay').addEventListener('change', (e) => saveSetting('showOverlay', e.target.checked));
  document.getElementById('set-notifications').addEventListener('change', (e) => saveSetting('notificationEnabled', e.target.checked));
  document.getElementById('set-privacy').addEventListener('change', (e) => saveSetting('privacyMode', e.target.checked));
  document.getElementById('set-reminder-time').addEventListener('change', (e) => saveSetting('reminderTime', e.target.value));

  document.getElementById('add-site-btn').addEventListener('click', () => openSiteModal());
  document.getElementById('site-modal-close').addEventListener('click', closeSiteModal);
  document.getElementById('site-cancel').addEventListener('click', closeSiteModal);
  document.getElementById('site-save').addEventListener('click', saveSiteRule);

  document.getElementById('site-modal').addEventListener('click', (e) => {
    if (e.target.id === 'site-modal') closeSiteModal();
  });

  document.getElementById('export-btn').addEventListener('click', exportDataAction);
  document.getElementById('import-btn').addEventListener('click', importDataAction);
  document.getElementById('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) handleImportFile(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('clear-all-btn').addEventListener('click', clearAllData);

  document.getElementById('view-history-btn').addEventListener('click', viewHistory);
  document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
  document.getElementById('history-modal-close').addEventListener('click', () => {
    document.getElementById('history-modal').style.display = 'none';
  });
  document.getElementById('history-modal').addEventListener('click', (e) => {
    if (e.target.id === 'history-modal') {
      document.getElementById('history-modal').style.display = 'none';
    }
  });
});

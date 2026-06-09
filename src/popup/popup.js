let currentStatus = 'want_to_watch';
let currentItem = null;
let editingTags = [];
let editingRating = 0;
let privacyMode = false;

function maskText(text, showLength = 0) {
  if (!text) return '••••••';
  const str = String(text);
  if (showLength > 0 && str.length <= showLength) return '•'.repeat(str.length);
  return '•'.repeat(Math.max(6, Math.min(12, str.length)));
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function renderStars(rating, editable = true, containerId = '') {
  if (privacyMode && !editable) {
    return '<span style="color:#9ca3af;">•••••</span>';
  }
  let html = `<div class="star-rating ${editable ? 'reverse' : ''}" ${containerId ? `id="${containerId}"` : ''} style="flex-direction:row-reverse;display:inline-flex">`;
  for (let i = 5; i >= 1; i--) {
    const filled = i <= rating;
    html += `<span class="star ${filled ? 'filled' : ''}" data-value="${i}" style="cursor:${editable ? 'pointer' : 'default'}">★</span>`;
  }
  html += '</div>';
  return html;
}

function renderTags(tags, editable = false) {
  if (!tags || !tags.length) return '';
  if (privacyMode && !editable) {
    return `<span class="tag">••••</span>`;
  }
  return tags.map(tag => `
    <span class="tag">${editable ? tag : (privacyMode ? '••••' : tag)}${editable ? `<span class="tag-remove" data-tag="${tag}">×</span>` : ''}</span>
  `).join('');
}

function renderCurrentVideoCard(item, videoInfo) {
  const progressPercent = privacyMode ? 0 : (item.duration > 0 ? Math.min(100, (item.progress / item.duration) * 100) : 0);
  const displayTitle = privacyMode ? maskText(item.title) : item.title;
  const displayPlatform = privacyMode ? '🏠 ••••' : (item.platform ? '🏠 ' + item.platform : '');
  const displaySeason = privacyMode ? '' : (item.season ? ' · 第' + item.season + '季' : '');
  const displayEpisode = privacyMode ? '' : (item.episode ? ' · 第' + item.episode + '集' : '');
  const displayRating = privacyMode ? '' : (item.rating ? ' · <span style="color:#f59e0b">' + '★'.repeat(item.rating) + '</span>' : '');
  const displayProgress = privacyMode ? '••:•• / ••:••' : `⏱ ${formatTime(item.progress)} / ${formatTime(item.duration)}`;
  const displayPercent = privacyMode ? '••%' : `${progressPercent.toFixed(0)}%`;
  const privacyBadge = privacyMode ? ' <span style="font-size:11px;padding:1px 6px;background:#fef3c7;color:#92400e;border-radius:4px;">🔒 隐私模式</span>' : '';
  return `
    <div class="video-card">
      <div class="video-card-header">
        <div class="video-card-title">${displayTitle}${privacyBadge}</div>
        <span class="status-badge status-${item.status}">${STATUS_LABELS[item.status]}</span>
      </div>
      <div class="video-card-meta">
        ${displayPlatform}
        ${displaySeason}
        ${displayEpisode}
        ${displayRating}
      </div>
      <div class="progress-info">
        <span>${displayProgress}</span>
        <span style="margin-left:auto">${displayPercent}</span>
      </div>
      <div class="progress-bar" style="margin-top:6px">
        <div class="progress-bar-fill" style="width:${progressPercent}%"></div>
      </div>
      <div class="video-card-actions">
        <button class="btn btn-secondary btn-sm" id="current-edit-btn">编辑</button>
        <button class="btn btn-secondary btn-sm" id="current-copy-btn" ${privacyMode ? 'disabled' : ''}>分享</button>
        <button class="btn btn-primary btn-sm" id="current-sync-btn" ${privacyMode ? 'disabled' : ''}>同步进度</button>
      </div>
    </div>
  `;
}

function renderItemRow(item) {
  const icon = item.status === 'completed' ? '✅' : item.status === 'watching' ? '▶️' : '📌';
  const subtitleParts = [];
  if (!privacyMode) {
    if (item.platform) subtitleParts.push(item.platform);
    if (item.season || item.episode) {
      const ep = [];
      if (item.season) ep.push('S' + item.season);
      if (item.episode) ep.push('E' + item.episode);
      subtitleParts.push(ep.join(''));
    }
    if (item.rating) subtitleParts.push('★'.repeat(item.rating));
    if (item.lastWatchedAt) subtitleParts.push('最近: ' + formatDate(item.lastWatchedAt));
  } else {
    subtitleParts.push('🔒 隐私模式');
  }

  return `
    <div class="item-row" data-id="${item.id}">
      <div class="item-row-icon">${icon}</div>
      <div class="item-row-content">
        <div class="item-row-title">${privacyMode ? maskText(item.title) : item.title}</div>
        <div class="item-row-subtitle">${subtitleParts.join(' · ')}</div>
      </div>
      <div class="item-row-actions">
        <button class="mini-btn" data-action="edit" title="编辑">✏️</button>
        <button class="mini-btn" data-action="delete" title="删除">🗑️</button>
      </div>
    </div>
  `;
}

async function getActiveTabVideoInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });
    return response || null;
  } catch {
    return null;
  }
}

async function loadCurrentTab() {
  const section = document.getElementById('current-video-section');
  const card = document.getElementById('current-video-card');
  const videoInfo = await getActiveTabVideoInfo();

  if (videoInfo && videoInfo.title) {
    const items = await getItems();
    let item = items.find(i => (i.url && videoInfo.url && (i.url === videoInfo.url || videoInfo.url.includes(i.url))) ||
      (i.title === videoInfo.title && i.platform === videoInfo.platform));
    if (!item) {
      item = await findOrCreateItem(videoInfo);
    }
    currentItem = item;
    section.style.display = 'block';
    card.innerHTML = renderCurrentVideoCard(item, videoInfo);
    bindCurrentCardEvents();
  } else {
    section.style.display = 'none';
  }
}

function bindCurrentCardEvents() {
  document.getElementById('current-edit-btn')?.addEventListener('click', () => {
    openItemModal(currentItem);
  });

  document.getElementById('current-copy-btn')?.addEventListener('click', async () => {
    const card = generateShareCard(currentItem);
    try {
      await navigator.clipboard.writeText(card);
      showToast('分享卡片已复制');
    } catch {
      showToast('复制失败');
    }
  });

  document.getElementById('current-sync-btn')?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'saveCurrentProgress' });
      showToast('进度已同步');
      loadCurrentTab();
    } catch {
      showToast('同步失败');
    }
  });
}

async function loadRecentTab() {
  const container = document.getElementById('recent-list');
  const items = await getItems();
  const recent = items
    .filter(i => i.lastWatchedAt)
    .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
    .slice(0, 20);

  if (!recent.length) {
    container.innerHTML = `<div class="empty-hint"><div class="empty-hint-icon">📺</div><div class="empty-hint-text">暂无观看记录</div></div>`;
    return;
  }

  container.innerHTML = recent.map(renderItemRow).join('');
  bindItemRowEvents(container);
}

async function loadWatchlistTab() {
  const container = document.getElementById('watchlist-list');
  const items = await getItems();
  const watchlist = items
    .filter(i => i.status === 'want_to_watch' || i.status === 'watching')
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!watchlist.length) {
    container.innerHTML = `<div class="empty-hint"><div class="empty-hint-icon">📋</div><div class="empty-hint-text">待补清单为空</div></div>`;
    return;
  }

  container.innerHTML = watchlist.map(renderItemRow).join('');
  bindItemRowEvents(container);
}

function bindItemRowEvents(container) {
  container.querySelectorAll('.item-row').forEach(row => {
    const id = row.dataset.id;
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.mini-btn')) return;
      const item = await getItemById(id);
      if (item) openItemModal(item);
    });

    row.querySelector('[data-action="edit"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = await getItemById(id);
      if (item) openItemModal(item);
    });

    row.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这个条目吗？')) {
        await deleteItem(id);
        showToast('已删除');
        refreshAllTabs();
      }
    });
  });
}

function openItemModal(item) {
  editingTags = [...(item.tags || [])];
  editingRating = item.rating || 0;

  const modal = document.getElementById('item-modal');

  if (privacyMode) {
    document.getElementById('modal-title').textContent = '🔒 隐私模式';
    document.getElementById('modal-body').innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.5;">🔒</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px;">隐私模式已开启</div>
        <div style="color:var(--text-secondary);font-size:14px;line-height:1.6;margin-bottom:24px;">
          当前处于隐私模式，所有敏感内容已被隐藏。<br>
          请先在「设置 → 隐私设置」中关闭隐私模式，<br>
          然后再进行编辑操作。
        </div>
        <button class="btn btn-primary" id="privacy-close-modal">知道了</button>
      </div>
    `;
    modal.style.display = 'flex';
    document.getElementById('privacy-close-modal').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    return;
  }

  document.getElementById('modal-title').textContent = item.title || '编辑条目';

  const bookmarksHtml = (item.bookmarks || []).map(bm => `
    <div class="bookmark-list-item" data-id="${bm.id}">
      <span class="time">${formatTime(bm.time)}</span>
      <span class="note">${bm.note || '无备注'}</span>
      <button class="remove" data-bookmark="${bm.id}">×</button>
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:13px">暂无收藏片段</div>';

  const remindersHtml = (item.reminders || []).map(rem => `
    <div class="reminder-list-item" data-id="${rem.id}">
      <span class="time">📅 ${new Date(rem.time).toLocaleString('zh-CN')} - ${rem.note || '提醒'}</span>
      <button class="remove" data-reminder="${rem.id}">×</button>
    </div>
  `).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label">标题</label>
        <input type="text" class="input" id="edit-title" value="${item.title || ''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">季</label>
          <input type="number" class="input" id="edit-season" value="${item.season || ''}" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">集</label>
          <input type="number" class="input" id="edit-episode" value="${item.episode || ''}" min="1">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">进度(秒)</label>
          <input type="number" class="input" id="edit-progress" value="${item.progress || 0}" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">总时长(秒)</label>
          <input type="number" class="input" id="edit-duration" value="${item.duration || 0}" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">状态</label>
        <div class="status-tabs">
          <button class="status-tab ${item.status === 'want_to_watch' ? 'active' : ''}" data-status="want_to_watch">想看</button>
          <button class="status-tab ${item.status === 'watching' ? 'active' : ''}" data-status="watching">在看</button>
          <button class="status-tab ${item.status === 'completed' ? 'active' : ''}" data-status="completed">看完</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">评分</label>
        <div id="edit-rating">${renderStars(editingRating)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">标签</label>
        <div class="tags-display" id="edit-tags-display">${renderTags(editingTags, true)}</div>
        <div class="form-row" style="margin-top:8px">
          <input type="text" class="input" id="edit-tag-input" placeholder="输入标签后按回车添加">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">短评</label>
        <textarea class="textarea" id="edit-review" placeholder="写下你的观后感...">${item.review || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">链接</label>
        <input type="text" class="input" id="edit-url" value="${item.url || ''}" placeholder="作品链接">
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">收藏片段</div>
      <div id="edit-bookmarks">${bookmarksHtml}</div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">提醒</div>
      ${remindersHtml || '<div style="color:var(--text-muted);font-size:13px;margin-bottom:8px">暂无提醒</div>'}
      <div class="form-row" id="edit-reminder-row">
        <input type="datetime-local" class="input" id="edit-reminder-time">
        <button class="btn btn-secondary btn-sm" id="edit-add-reminder" style="flex:0 0 auto">添加提醒</button>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" id="edit-copy-card">复制分享卡片</button>
      <button class="btn btn-primary" id="edit-save">保存</button>
    </div>
  `;

  let selectedStatus = item.status;
  modal.querySelectorAll('.status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedStatus = tab.dataset.status;
    });
  });

  modal.querySelectorAll('#edit-rating .star').forEach(star => {
    star.addEventListener('click', () => {
      editingRating = parseInt(star.dataset.value);
      modal.querySelectorAll('#edit-rating .star').forEach(s => {
        s.classList.toggle('filled', parseInt(s.dataset.value) <= editingRating);
      });
    });
  });

  modal.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      editingTags = editingTags.filter(t => t !== btn.dataset.tag);
      document.getElementById('edit-tags-display').innerHTML = renderTags(editingTags, true);
      bindTagRemoveEvents();
    });
  });

  function bindTagRemoveEvents() {
    modal.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        editingTags = editingTags.filter(t => t !== btn.dataset.tag);
        document.getElementById('edit-tags-display').innerHTML = renderTags(editingTags, true);
        bindTagRemoveEvents();
      });
    });
  }

  document.getElementById('edit-tag-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      const tag = e.target.value.trim();
      if (!editingTags.includes(tag)) editingTags.push(tag);
      e.target.value = '';
      document.getElementById('edit-tags-display').innerHTML = renderTags(editingTags, true);
      bindTagRemoveEvents();
    }
  });

  modal.querySelectorAll('[data-bookmark]').forEach(btn => {
    btn.addEventListener('click', () => {
      const bmId = btn.dataset.bookmark;
      item.bookmarks = (item.bookmarks || []).filter(b => b.id !== bmId);
      document.getElementById('edit-bookmarks').innerHTML = (item.bookmarks || []).map(bm => `
        <div class="bookmark-list-item" data-id="${bm.id}">
          <span class="time">${formatTime(bm.time)}</span>
          <span class="note">${bm.note || '无备注'}</span>
          <button class="remove" data-bookmark="${bm.id}">×</button>
        </div>
      `).join('') || '<div style="color:var(--text-muted);font-size:13px">暂无收藏片段</div>';
      bindBookmarkRemove();
    });
  });

  function bindBookmarkRemove() {
    modal.querySelectorAll('[data-bookmark]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bmId = btn.dataset.bookmark;
        item.bookmarks = (item.bookmarks || []).filter(b => b.id !== bmId);
        document.getElementById('edit-bookmarks').innerHTML = (item.bookmarks || []).map(bm => `
          <div class="bookmark-list-item" data-id="${bm.id}">
            <span class="time">${formatTime(bm.time)}</span>
            <span class="note">${bm.note || '无备注'}</span>
            <button class="remove" data-bookmark="${bm.id}">×</button>
          </div>
        `).join('') || '<div style="color:var(--text-muted);font-size:13px">暂无收藏片段</div>';
        bindBookmarkRemove();
      });
    });
  }

  modal.querySelectorAll('[data-reminder]').forEach(btn => {
    btn.addEventListener('click', () => {
      const remId = btn.dataset.reminder;
      item.reminders = (item.reminders || []).filter(r => r.id !== remId);
      refreshReminders();
    });
  });

  function refreshReminders() {
    const remindersHtml = (item.reminders || []).map(rem => `
      <div class="reminder-list-item" data-id="${rem.id}">
        <span class="time">📅 ${new Date(rem.time).toLocaleString('zh-CN')} - ${rem.note || '提醒'}</span>
        <button class="remove" data-reminder="${rem.id}">×</button>
      </div>
    `).join('') || '<div style="color:var(--text-muted);font-size:13px;margin-bottom:8px">暂无提醒</div>';
    const row = document.getElementById('edit-reminder-row');
    row.insertAdjacentHTML('beforebegin', remindersHtml);
    row.parentElement.querySelectorAll('.reminder-list-item').forEach(el => el.remove());
    row.insertAdjacentHTML('beforebegin', (item.reminders || []).map(rem => `
      <div class="reminder-list-item" data-id="${rem.id}">
        <span class="time">📅 ${new Date(rem.time).toLocaleString('zh-CN')} - ${rem.note || '提醒'}</span>
        <button class="remove" data-reminder="${rem.id}">×</button>
      </div>
    `).join(''));
    modal.querySelectorAll('[data-reminder]').forEach(b => {
      b.addEventListener('click', () => {
        item.reminders = (item.reminders || []).filter(r => r.id !== b.dataset.reminder);
        refreshReminders();
      });
    });
  }

  document.getElementById('edit-add-reminder')?.addEventListener('click', () => {
    const timeInput = document.getElementById('edit-reminder-time');
    if (!timeInput.value) {
      showToast('请选择提醒时间');
      return;
    }
    const reminder = {
      id: Date.now().toString(36),
      time: new Date(timeInput.value).getTime(),
      note: '追番提醒',
      createdAt: Date.now()
    };
    item.reminders = [...(item.reminders || []), reminder];
    timeInput.value = '';
    refreshReminders();
    showToast('提醒已添加');
  });

  document.getElementById('edit-copy-card')?.addEventListener('click', async () => {
    const card = generateShareCard({
      ...item,
      status: selectedStatus,
      rating: editingRating,
      tags: editingTags,
      review: document.getElementById('edit-review').value,
      title: document.getElementById('edit-title').value
    });
    try {
      await navigator.clipboard.writeText(card);
      showToast('分享卡片已复制');
    } catch {
      showToast('复制失败');
    }
  });

  document.getElementById('edit-save')?.addEventListener('click', async () => {
    const updates = {
      title: document.getElementById('edit-title').value || item.title,
      season: document.getElementById('edit-season').value ? parseInt(document.getElementById('edit-season').value) : null,
      episode: document.getElementById('edit-episode').value ? parseInt(document.getElementById('edit-episode').value) : null,
      progress: parseInt(document.getElementById('edit-progress').value) || 0,
      duration: parseInt(document.getElementById('edit-duration').value) || 0,
      status: selectedStatus,
      rating: editingRating,
      tags: editingTags,
      review: document.getElementById('edit-review').value,
      url: document.getElementById('edit-url').value,
      bookmarks: item.bookmarks,
      reminders: item.reminders
    };

    await updateItem(item.id, updates);
    showToast('已保存');
    modal.style.display = 'none';
    refreshAllTabs();
  });

  modal.style.display = 'flex';
  currentItem = item;
}

function refreshAllTabs() {
  loadCurrentTab();
  loadRecentTab();
  loadWatchlistTab();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#main-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#main-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      document.getElementById('tab-' + tabId).style.display = 'block';
    });
  });

  document.querySelectorAll('.status-tabs .status-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.status-tabs .status-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentStatus = tab.dataset.status;
    });
  });

  document.getElementById('quick-add-btn').addEventListener('click', async () => {
    const title = document.getElementById('quick-title').value.trim();
    if (!title) {
      showToast('请输入标题');
      return;
    }
    const videoInfo = await getActiveTabVideoInfo();
    await addItem({
      title,
      season: document.getElementById('quick-season').value ? parseInt(document.getElementById('quick-season').value) : null,
      episode: document.getElementById('quick-episode').value ? parseInt(document.getElementById('quick-episode').value) : null,
      status: currentStatus,
      url: videoInfo?.url || '',
      platform: videoInfo?.platform || ''
    });
    document.getElementById('quick-title').value = '';
    document.getElementById('quick-season').value = '';
    document.getElementById('quick-episode').value = '';
    showToast('已添加到列表');
    refreshAllTabs();
  });

  document.getElementById('open-library').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/library/library.html') });
  });

  document.getElementById('open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('item-modal').style.display = 'none';
  });

  document.getElementById('item-modal').addEventListener('click', (e) => {
    if (e.target.id === 'item-modal') {
      document.getElementById('item-modal').style.display = 'none';
    }
  });

  async function loadPrivacySetting() {
    const settings = await getSettings();
    privacyMode = settings.privacyMode === true;
  }

  (async function init() {
    await loadPrivacySetting();

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'local' && changes.tracker_settings) {
        const oldPrivacy = privacyMode;
        await loadPrivacySetting();
        if (oldPrivacy !== privacyMode) {
          refreshAllTabs();
        }
      }
    });

    refreshAllTabs();
  })();
});

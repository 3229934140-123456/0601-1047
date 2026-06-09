let allItems = [];
let currentView = 'grid';
let editingItem = null;

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function getIconForStatus(status) {
  switch (status) {
    case 'completed': return '✅';
    case 'watching': return '▶️';
    case 'want_to_watch': return '📌';
    default: return '🎬';
  }
}

function renderStars(rating) {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

const FIELD_LABELS = {
  created: '创建',
  progress: '播放进度',
  duration: '视频时长',
  status: '观看状态',
  rating: '评分',
  review: '短评',
  tags: '标签',
  season: '季',
  episode: '集',
  bookmarks: '收藏片段',
  reminders: '提醒'
};

function formatFieldValue(field, val) {
  if (val === null || val === undefined || val === '') return '（空）';
  if (field === 'status') return STATUS_LABELS[val] || val;
  if (field === 'rating') return val ? renderStars(val) : '未评分';
  if (field === 'progress' || field === 'duration') return formatTime(val);
  if (field === 'season') return '第' + val + '季';
  if (field === 'episode') return '第' + val + '集';
  if (field === 'tags') return Array.isArray(val) && val.length ? '#' + val.join(' #') : '（无）';
  if (field === 'bookmarks') return Array.isArray(val) ? val.length + '个片段' : val;
  if (field === 'reminders') return Array.isArray(val) ? val.length + '个提醒' : val;
  if (field === 'review') return val || '（空）';
  if (field === 'created') return '✓';
  return String(val);
}

async function renderTimeline(itemId) {
  const logs = await getChangeLogsByItemId(itemId);
  if (!logs || !logs.length) {
    return '<div style="color:var(--text-muted);font-size:13px;padding:12px 0">暂无变更记录，保存进度或修改状态后会在这里显示</div>';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return `
    <div class="timeline" style="margin-top:8px">
      ${logs.slice(0, 50).map(log => {
        const t = new Date(log.timestamp);
        const dateStr = t.toLocaleDateString('zh-CN');
        const timeStr = t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        let dateLabel = dateStr;
        if (t >= today) dateLabel = '今天';
        else if (t >= yesterday) dateLabel = '昨天';

        const changesHtml = log.changes.map(c => {
          const label = FIELD_LABELS[c.field] || c.field;
          const oldV = formatFieldValue(c.field, c.oldValue);
          const newV = formatFieldValue(c.field, c.newValue);
          return `<div class="timeline-change">
            <span class="timeline-field">${label}</span>
            <span class="timeline-arrow">→</span>
            <span class="timeline-new">${newV}</span>
            ${c.field !== 'created' ? `<span class="timeline-old" title="原值：${oldV}">（原：${oldV}）</span>` : ''}
          </div>`;
        }).join('');

        const snapProgress = log.snapshot?.progress || 0;
        const snapDuration = log.snapshot?.duration || 0;
        const snapPercent = snapDuration > 0 ? Math.round(snapProgress / snapDuration * 100) : 0;

        return `
          <div class="timeline-item" data-log-id="${log.id}">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <span class="timeline-date">${dateLabel} ${timeStr}</span>
                ${log.note ? `<span class="timeline-note">${log.note}</span>` : ''}
                ${log.snapshot?.progress ? `<span class="timeline-progress" style="margin-left:auto">▶ ${formatTime(snapProgress)}${snapPercent ? ' (' + snapPercent + '%)' : ''}</span>` : ''}
              </div>
              <div class="timeline-changes">${changesHtml}</div>
              ${log.snapshot?.review ? `<div class="timeline-snapshot-review" title="当时的短评">📝 ${log.snapshot.review}</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function populateFilters() {
  const platforms = [...new Set(allItems.map(i => i.platform).filter(Boolean))].sort();
  const platformSelect = document.getElementById('filter-platform');
  platformSelect.innerHTML = '<option value="">全部平台</option>' +
    platforms.map(p => `<option value="${p}">${p}</option>`).join('');

  const allTags = [...new Set(allItems.flatMap(i => i.tags || []).filter(Boolean))].sort();
  const tagSelect = document.getElementById('filter-tag');
  tagSelect.innerHTML = '<option value="">全部标签</option>' +
    allTags.map(t => `<option value="${t}">${t}</option>`).join('');
}

function updateStats() {
  document.getElementById('stat-total').textContent = allItems.length;
  document.getElementById('stat-watching').textContent = allItems.filter(i => i.status === 'watching').length;
  document.getElementById('stat-want').textContent = allItems.filter(i => i.status === 'want_to_watch').length;
  document.getElementById('stat-completed').textContent = allItems.filter(i => i.status === 'completed').length;
}

function getFilteredItems() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const status = document.getElementById('filter-status').value;
  const platform = document.getElementById('filter-platform').value;
  const rating = document.getElementById('filter-rating').value;
  const tag = document.getElementById('filter-tag').value;
  const [sortField, sortDir] = document.getElementById('sort-by').value.split('-');

  let filtered = [...allItems];

  if (search) {
    filtered = filtered.filter(item => {
      return item.title?.toLowerCase().includes(search) ||
             item.tags?.some(t => t.toLowerCase().includes(search)) ||
             item.review?.toLowerCase().includes(search) ||
             item.platform?.toLowerCase().includes(search);
    });
  }

  if (status) {
    filtered = filtered.filter(i => i.status === status);
  }

  if (platform) {
    filtered = filtered.filter(i => i.platform === platform);
  }

  if (rating) {
    const r = parseInt(rating);
    if (r === 0) {
      filtered = filtered.filter(i => !i.rating);
    } else {
      filtered = filtered.filter(i => (i.rating || 0) >= r);
    }
  }

  if (tag) {
    filtered = filtered.filter(i => i.tags?.includes(tag));
  }

  filtered.sort((a, b) => {
    let va = a[sortField];
    let vb = b[sortField];
    if (typeof va === 'string') {
      va = va.toLowerCase();
      vb = vb.toLowerCase();
    }
    va = va || 0;
    vb = vb || 0;
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  return filtered;
}

function renderGridCard(item) {
  const progressPercent = item.duration > 0 ? Math.min(100, (item.progress / item.duration) * 100) : 0;
  const metaParts = [];
  if (item.platform) metaParts.push(`<span class="item-platform">🏠 ${item.platform}</span>`);
  if (item.season || item.episode) {
    const ep = [];
    if (item.season) ep.push('S' + item.season);
    if (item.episode) ep.push('E' + item.episode);
    metaParts.push(`<span class="item-episode">${ep.join('')}</span>`);
  }
  if (item.rating) metaParts.push(`<span class="item-rating">${renderStars(item.rating)}</span>`);

  return `
    <div class="item-card" data-id="${item.id}">
      <div class="item-actions">
        <button class="item-action-btn" data-action="edit" title="编辑">✏️</button>
        <button class="item-action-btn" data-action="delete" title="删除">🗑️</button>
      </div>
      <span class="status-badge status-${item.status} item-status-badge">${STATUS_LABELS[item.status]}</span>
      <div class="item-cover">${getIconForStatus(item.status)}</div>
      <div class="item-content">
        <div class="item-title">${item.title}</div>
        <div class="item-meta">${metaParts.join(' · ')}</div>
        ${item.tags?.length ? `<div class="item-tags">${item.tags.slice(0, 5).map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
        ${item.review ? `<div class="item-review">${item.review}</div>` : ''}
        <div class="item-progress">
          <div class="item-progress-info">
            <span>⏱ ${formatTime(item.progress)}</span>
            <span>${progressPercent.toFixed(0)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:${progressPercent}%"></div>
          </div>
        </div>
        <div class="item-date">更新于 ${formatDate(item.updatedAt)}</div>
      </div>
    </div>
  `;
}

function renderListItem(item) {
  const progressPercent = item.duration > 0 ? Math.min(100, (item.progress / item.duration) * 100) : 0;
  const metaParts = [];
  if (item.platform) metaParts.push(item.platform);
  if (item.season || item.episode) {
    const ep = [];
    if (item.season) ep.push('S' + item.season);
    if (item.episode) ep.push('E' + item.episode);
    metaParts.push(ep.join(''));
  }

  return `
    <div class="item-card" data-id="${item.id}">
      <div class="item-actions">
        <button class="item-action-btn" data-action="edit" title="编辑">✏️</button>
        <button class="item-action-btn" data-action="delete" title="删除">🗑️</button>
      </div>
      <div class="item-cover">${getIconForStatus(item.status)}</div>
      <div class="item-content">
        <div class="item-title">${item.title}</div>
        <div class="item-meta">
          ${metaParts.map(m => `<span class="item-platform">${m}</span>`).join(' · ')}
          ${item.rating ? `<span class="item-rating">${renderStars(item.rating)}</span>` : ''}
          ${item.tags?.length ? item.tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('') : ''}
        </div>
      </div>
      <div class="item-progress">
        <div class="item-progress-info">
          <span>${formatTime(item.progress)}</span>
          <span>${progressPercent.toFixed(0)}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width:${progressPercent}%"></div>
        </div>
      </div>
      <span class="status-badge status-${item.status} item-status-badge">${STATUS_LABELS[item.status]}</span>
      <div class="item-date">${formatDate(item.updatedAt)}</div>
    </div>
  `;
}

function renderItems() {
  const container = document.getElementById('items-container');
  const emptyState = document.getElementById('empty-state');
  const filtered = getFilteredItems();

  container.className = 'items-container ' + currentView;

  if (!filtered.length) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = filtered.map(item =>
    currentView === 'grid' ? renderGridCard(item) : renderListItem(item)
  ).join('');

  container.querySelectorAll('.item-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        if (action === 'delete') {
          if (confirm('确定要删除这个条目吗？')) {
            await deleteItem(id);
            showToast('已删除');
            await loadData();
          }
        } else if (action === 'edit') {
          const item = await getItemById(id);
          if (item) openDetailModal(item);
        }
        return;
      }
      const item = await getItemById(id);
      if (item) openDetailModal(item);
    });
  });
}

async function openDetailModal(item) {
  editingItem = item;
  const modal = document.getElementById('item-modal');
  document.getElementById('modal-title').textContent = item.title;

  const progressPercent = item.duration > 0 ? Math.min(100, (item.progress / item.duration) * 100) : 0;
  const metaParts = [];
  if (item.platform) metaParts.push(item.platform);
  if (item.season || item.episode) {
    const ep = [];
    if (item.season) ep.push('第' + item.season + '季');
    if (item.episode) ep.push('第' + item.episode + '集');
    metaParts.push(ep.join(' '));
  }

  const bookmarksHtml = (item.bookmarks || []).length ? `
    <div class="detail-bookmarks">
      ${item.bookmarks.map(bm => `
        <div class="detail-bookmark-item" data-time="${bm.time}" data-url="${item.url || ''}">
          <span class="detail-bookmark-time">${formatTime(bm.time)}</span>
          <span class="detail-bookmark-note">${bm.note || '无备注'}</span>
          <button class="detail-remove-btn" data-bookmark="${bm.id}">×</button>
        </div>
      `).join('')}
    </div>
  ` : '<div style="color:var(--text-muted);font-size:13px">暂无收藏片段</div>';

  const remindersHtml = (item.reminders || []).length ? `
    <div class="detail-reminders">
      ${item.reminders.map(rem => `
        <div class="detail-reminder-item">
          <span class="detail-reminder-time">📅 ${new Date(rem.time).toLocaleString('zh-CN')} - ${rem.note || '追番提醒'}</span>
          <button class="detail-remove-btn" data-reminder="${rem.id}">×</button>
        </div>
      `).join('')}
    </div>
  ` : '<div style="color:var(--text-muted);font-size:13px">暂无提醒</div>';

  document.getElementById('modal-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">状态</div>
          <div class="detail-value"><span class="status-badge status-${item.status}">${STATUS_LABELS[item.status]}</span></div>
        </div>
        <div class="detail-item">
          <div class="detail-label">评分</div>
          <div class="detail-value detail-rating">${item.rating ? renderStars(item.rating) : '未评分'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">平台</div>
          <div class="detail-value">${item.platform || '未知'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">季/集</div>
          <div class="detail-value">${metaParts.slice(1).join(' ') || '-'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">播放进度</div>
          <div class="detail-value">${formatTime(item.progress)} / ${formatTime(item.duration)} (${progressPercent.toFixed(0)}%)</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">更新时间</div>
          <div class="detail-value">${formatDateTime(item.updatedAt)}</div>
        </div>
      </div>
    </div>

    ${item.tags?.length ? `
      <div class="detail-section">
        <div class="detail-section-title">标签</div>
        <div class="detail-tags">${item.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
      </div>
    ` : ''}

    ${item.review ? `
      <div class="detail-section">
        <div class="detail-section-title">短评</div>
        <div class="detail-review">${item.review}</div>
      </div>
    ` : ''}

    <div class="detail-section">
      <div class="detail-section-title">收藏片段</div>
      ${bookmarksHtml}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">提醒</div>
      ${remindersHtml}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📜 观看时间线</div>
      <div id="timeline-container" style="margin-top:4px"><span style="color:var(--text-muted);font-size:13px">加载中…</span></div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-copy">复制分享卡片</button>
      ${item.url ? `<a href="${item.url}" target="_blank" class="btn btn-secondary">打开链接</a>` : ''}
      <button class="btn btn-primary" id="modal-close2">关闭</button>
    </div>
  `;

  renderTimeline(item.id).then(html => {
    const container = document.getElementById('timeline-container');
    if (container) container.innerHTML = html;
  });

  modal.querySelectorAll('[data-bookmark]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bmId = btn.dataset.bookmark;
      editingItem.bookmarks = (editingItem.bookmarks || []).filter(b => b.id !== bmId);
      await updateItem(editingItem.id, { bookmarks: editingItem.bookmarks });
      openDetailModal(editingItem);
      showToast('已删除收藏片段');
    });
  });

  modal.querySelectorAll('[data-reminder]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const remId = btn.dataset.reminder;
      editingItem.reminders = (editingItem.reminders || []).filter(r => r.id !== remId);
      await updateItem(editingItem.id, { reminders: editingItem.reminders });
      openDetailModal(editingItem);
      showToast('已删除提醒');
    });
  });

  document.getElementById('modal-copy').addEventListener('click', async () => {
    const card = generateShareCard(editingItem);
    try {
      await navigator.clipboard.writeText(card);
      showToast('分享卡片已复制到剪贴板');
    } catch {
      showToast('复制失败');
    }
  });

  document.getElementById('modal-close2').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.style.display = 'flex';
}

async function loadData() {
  allItems = await getItems();
  updateStats();
  populateFilters();
  renderItems();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();

  ['search-input', 'filter-status', 'filter-platform', 'filter-rating', 'filter-tag', 'sort-by'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderItems);
    document.getElementById(id).addEventListener('change', renderItems);
  });

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      renderItems();
    });
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('item-modal').style.display = 'none';
  });

  document.getElementById('item-modal').addEventListener('click', (e) => {
    if (e.target.id === 'item-modal') {
      document.getElementById('item-modal').style.display = 'none';
    }
  });

  document.getElementById('nav-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

let allItems = [];
let currentView = 'grid';
let reviewRange = 'week';
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

  const fields = ['progress', 'status', 'rating', 'review', 'tags', 'season', 'episode'];
  const snapLabels = {
    progress: '播放进度',
    status: '观看状态',
    rating: '评分',
    review: '短评',
    tags: '标签',
    season: '季',
    episode: '集'
  };
  const formatSnap = (field, val) => {
    if (field === 'progress') return formatTime(val || 0);
    if (field === 'status') return STATUS_LABELS[val] || '—';
    if (field === 'rating') return val ? renderStars(val) : '未评分';
    if (field === 'review') return val ? val : '（空）';
    if (field === 'tags') return Array.isArray(val) && val.length ? '#' + val.join(' #') : '（无）';
    if (field === 'season') return val ? `第${val}季` : '—';
    if (field === 'episode') return val ? `第${val}集` : '—';
    return val != null ? String(val) : '—';
  };

  return `
    <div class="timeline" style="margin-top:8px">
      ${logs.slice(0, 100).map((log, idx) => {
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
        const changedFields = new Set(log.changes.map(c => c.field));
        const onlyProgress = changedFields.size === 1 && (changedFields.has('progress') || changedFields.has('duration') || changedFields.has('lastWatchedAt'));
        const changeSummary = log.changes.map(c => (FIELD_LABELS[c.field] || c.field)).join('、');

        const snapshotRows = fields.map(f => {
          const v = formatSnap(f, log.snapshot?.[f]);
          const isChanged = changedFields.has(f);
          return `<div class="timeline-snap-row ${isChanged ? 'changed' : ''}">
            <span class="timeline-snap-label">${snapLabels[f]}</span>
            <span class="timeline-snap-value">${v}</span>
          </div>`;
        }).join('');

        return `
          <div class="timeline-item" data-log-id="${log.id}">
            <div class="timeline-dot"></div>
            <div class="timeline-content timeline-collapsible ${idx === 0 ? 'expanded' : ''}">
              <div class="timeline-header timeline-toggle">
                <span class="timeline-date">${dateLabel} ${timeStr}</span>
                ${log.note ? `<span class="timeline-note">${log.note}</span>` : ''}
                ${onlyProgress ? `<span class="timeline-summary" title="本次只更新了播放进度">⏱ 仅更新进度</span>` : `<span class="timeline-summary" title="本次变更字段">✏️ ${changeSummary}</span>`}
                ${log.snapshot?.progress ? `<span class="timeline-progress">▶ ${formatTime(snapProgress)}${snapPercent ? ' (' + snapPercent + '%)' : ''}</span>` : ''}
                <span class="timeline-caret">▾</span>
              </div>
              <div class="timeline-changes">${changesHtml}</div>
              <div class="timeline-snapshot-wrapper">
                <div class="timeline-snapshot-title">📷 当时的完整快照</div>
                <div class="timeline-snapshot-grid">${snapshotRows}</div>
                ${log.snapshot?.review ? `<div class="timeline-snapshot-review" title="当时的短评">📝 ${log.snapshot.review}</div>` : ''}
              </div>
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
    if (!container) return;
    container.innerHTML = html;

    container.querySelectorAll('.timeline-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const content = toggle.closest('.timeline-collapsible');
        if (!content) return;
        content.classList.toggle('expanded');
      });
    });
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

function setView(view) {
  currentView = view;
  const itemsContainer = document.getElementById('items-container');
  const emptyState = document.getElementById('empty-state');
  const reviewContainer = document.getElementById('review-container');
  const filterBar = document.querySelector('.filter-bar');
  const statsBar = document.querySelector('.stats-bar');

  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.view-btn[data-view="${view}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (view === 'review') {
    itemsContainer.style.display = 'none';
    emptyState.style.display = 'none';
    reviewContainer.style.display = 'block';
    if (filterBar) filterBar.style.display = 'none';
    renderReview();
  } else {
    itemsContainer.style.display = '';
    reviewContainer.style.display = 'none';
    if (filterBar) filterBar.style.display = '';
    renderItems();
  }
}

async function renderReview() {
  const container = document.getElementById('review-container');
  if (!container) return;

  const items = getFilteredItems();
  const now = Date.now();
  const rangeMs = reviewRange === 'week' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  const rangeCutoff = now - rangeMs;
  const staleDays = 14;
  const staleCutoff = now - staleDays * 24 * 3600 * 1000;

  if (!items.length) {
    container.innerHTML = `
      <div class="review-header">
        <h2 class="review-title">📊 观看复盘</h2>
        <div class="review-range">
          <button class="btn btn-sm ${reviewRange==='week'?'btn-primary':'btn-secondary'}" data-range="week">本周</button>
          <button class="btn btn-sm ${reviewRange==='month'?'btn-primary':'btn-secondary'}" data-range="month">本月</button>
        </div>
      </div>
      <div class="empty-state" style="display:block;margin-top:60px;">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">${document.getElementById('search-input').value || 
          Array.from(document.querySelectorAll('.select')).some(s=>s.value)
          ? '当前筛选条件下没有作品，试试调整筛选'
          : '还没有收藏任何作品，去追几部剧吧'}</div>
      </div>
    `;
    bindReviewEvents(container);
    return;
  }

  const platformMap = {};
  let totalEpisodes = 0;
  let recentlyWatched = [];
  let staleShows = [];

  items.forEach(item => {
    if (item.platform) {
      platformMap[item.platform] = (platformMap[item.platform] || 0) + 1;
    } else {
      platformMap['未标注'] = (platformMap['未标注'] || 0) + 1;
    }
    if (item.episode) totalEpisodes += Number(item.episode) || 0;
    const lastWatched = item.lastWatchedAt || item.updatedAt || item.createdAt || 0;
    if (lastWatched >= rangeCutoff) {
      recentlyWatched.push(item);
    }
    if (item.status === 'watching' && lastWatched < staleCutoff) {
      staleShows.push({ ...item, _staleDays: Math.floor((now - lastWatched) / (24 * 3600 * 1000)) });
    }
  });

  recentlyWatched.sort((a, b) => (b.lastWatchedAt || b.updatedAt || 0) - (a.lastWatchedAt || a.updatedAt || 0));
  staleShows.sort((a, b) => b._staleDays - a._staleDays);
  recentlyWatched = recentlyWatched.slice(0, 10);
  staleShows = staleShows.slice(0, 10);

  const platformRows = Object.entries(platformMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const pct = Math.round(count / items.length * 100);
      return `
        <div class="review-platform-row">
          <span class="review-platform-name">${name}</span>
          <div class="review-platform-bar">
            <div class="review-platform-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="review-platform-count">${count} 部</span>
        </div>
      `;
    }).join('');

  const renderItemRow = (item, extra = '') => `
    <div class="review-item-row" data-id="${item.id}">
      <div class="review-item-main" data-action="detail">
        <div class="review-item-title">
          <span class="review-item-status">${getIconForStatus(item.status)}</span>
          <span>${item.title || '未命名作品'}</span>
          ${item.season || item.episode ? `<span class="review-item-season">S${item.season||0}E${item.episode||0}</span>` : ''}
          ${item.rating ? `<span class="review-item-rating">${renderStars(item.rating)}</span>` : ''}
        </div>
        <div class="review-item-meta">
          ${item.platform ? `<span>🏷 ${item.platform}</span>` : ''}
          ${item.progress ? `<span>⏱ ${formatFieldValue('progress', item.progress)}</span>` : ''}
          ${extra}
        </div>
      </div>
      <div class="review-item-actions">
        ${item.url ? `<a class="btn btn-sm btn-secondary" href="${item.url}" target="_blank" rel="noopener" title="打开原播放页">🔗</a>` : ''}
        <button class="btn btn-sm btn-primary" data-action="detail" title="查看详情">详情</button>
      </div>
    </div>
  `;

  container.innerHTML = `
    <div class="review-header">
      <h2 class="review-title">📊 观看复盘</h2>
      <div class="review-range">
        <button class="btn btn-sm ${reviewRange==='week'?'btn-primary':'btn-secondary'}" data-range="week">本周</button>
        <button class="btn btn-sm ${reviewRange==='month'?'btn-primary':'btn-secondary'}" data-range="month">本月</button>
      </div>
    </div>

    <div class="review-grid">
      <div class="review-card">
        <div class="review-card-title">🏷 平台分布</div>
        <div class="review-card-subtitle">共 ${items.length} 部作品</div>
        <div class="review-platform-list">
          ${platformRows || '<div class="review-empty">暂无平台数据</div>'}
        </div>
      </div>

      <div class="review-card">
        <div class="review-card-title">📺 追剧进度</div>
        <div class="review-stats">
          <div class="review-stat">
            <div class="review-stat-value">${totalEpisodes}</div>
            <div class="review-stat-label">累计集数</div>
          </div>
          <div class="review-stat">
            <div class="review-stat-value">${items.filter(i=>i.status==='watching').length}</div>
            <div class="review-stat-label">在看作品</div>
          </div>
          <div class="review-stat">
            <div class="review-stat-value">${recentlyWatched.length}</div>
            <div class="review-stat-label">${reviewRange==='week'?'本周':'本月'}活跃</div>
          </div>
        </div>
      </div>
    </div>

    <div class="review-card">
      <div class="review-card-title">🕒 ${reviewRange==='week'?'本周':'本月'}观看作品</div>
      <div class="review-card-subtitle">最近 ${recentlyWatched.length} 条记录</div>
      <div class="review-item-list">
        ${recentlyWatched.length
          ? recentlyWatched.map(it => renderItemRow(it, `<span>📅 ${new Date(it.lastWatchedAt||it.updatedAt).toLocaleDateString('zh-CN')}</span>`)).join('')
          : `<div class="review-empty">${reviewRange==='week'?'本周':'本月'}还没有观看记录哦</div>`
        }
      </div>
    </div>

    <div class="review-card review-stale">
      <div class="review-card-title">⚠️ 停更预警</div>
      <div class="review-card-subtitle">在看但超过 ${staleDays} 天没更新的作品（${staleShows.length} 部）</div>
      <div class="review-item-list">
        ${staleShows.length
          ? staleShows.map(it => renderItemRow(it, `<span style="color:var(--danger-color)">⏳ ${it._staleDays} 天未更新</span>`)).join('')
          : `<div class="review-empty">所有在看作品都在活跃更新中，状态很棒 ✨</div>`
        }
      </div>
    </div>
  `;

  bindReviewEvents(container);
}

function bindReviewEvents(container) {
  container.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      reviewRange = btn.dataset.range;
      renderReview();
    });
  });

  container.querySelectorAll('[data-action="detail"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      const row = e.currentTarget.closest('.review-item-row');
      if (!row) return;
      const id = row.dataset.id;
      const item = await getItemById(id);
      if (item) openDetailModal(item);
    });
  });
}

async function loadData() {
  allItems = await getItems();
  updateStats();
  populateFilters();
  if (currentView === 'review') {
    renderReview();
  } else {
    renderItems();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();

  function refreshCurrentView() {
    if (currentView === 'review') {
      renderReview();
    } else {
      renderItems();
    }
  }

  ['search-input', 'filter-status', 'filter-platform', 'filter-rating', 'filter-tag', 'sort-by'].forEach(id => {
    document.getElementById(id).addEventListener('input', refreshCurrentView);
    document.getElementById(id).addEventListener('change', refreshCurrentView);
  });

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setView(btn.dataset.view);
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

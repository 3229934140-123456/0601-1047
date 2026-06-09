(function() {
  'use strict';

  const STATUS = {
    WANT_TO_WATCH: 'want_to_watch',
    WATCHING: 'watching',
    COMPLETED: 'completed'
  };

  let currentItem = null;
  let overlayContainer = null;
  let panelVisible = false;
  let currentTags = [];
  let currentStatus = STATUS.WATCHING;
  let currentRating = 0;
  let privacyMode = false;
  let siteRules = [];
  let settingsLoaded = false;

  function maskText(text, showLength = 0) {
    if (!text) return '••••••';
    const str = String(text);
    if (showLength > 0 && str.length <= showLength) return '•'.repeat(str.length);
    return '•'.repeat(Math.max(6, Math.min(12, str.length)));
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function getPlatformName(hostname) {
    const platforms = [
      { match: 'bilibili', name: '哔哩哔哩' },
      { match: 'iqiyi', name: '爱奇艺' },
      { match: 'youku', name: '优酷' },
      { match: 'v.qq', name: '腾讯视频' },
      { match: 'youtube', name: 'YouTube' },
      { match: 'netflix', name: 'Netflix' },
      { match: 'mgtv', name: '芒果TV' }
    ];
    for (const p of platforms) {
      if (hostname.includes(p.match)) return p.name;
    }
    return hostname;
  }

  function detectVideoInfo() {
    const hostname = location.hostname;
    const url = location.href;

    const matchedRule = (siteRules || []).find(rule => {
      if (!rule || !rule.enabled || !rule.match) return false;
      return rule.match.some(m => hostname.includes(m.replace(/\./g, '\\.').replace(/\*/g, '.*')) ||
        hostname.includes(m));
    });

    const platform = matchedRule ? matchedRule.name : getPlatformName(hostname);

    let title = '';
    if (matchedRule && matchedRule.titleSelector) {
      const selectors = Array.isArray(matchedRule.titleSelector)
        ? matchedRule.titleSelector
        : matchedRule.titleSelector.split(',').map(s => s.trim()).filter(Boolean);
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.textContent && el.textContent.trim().length > 0) {
            title = el.textContent.trim();
            if (title.length > 3) break;
          }
        } catch (e) {
          console.warn('Invalid selector:', sel, e);
        }
      }
    }

    if (!title) {
      const defaultTitleSelectors = [
        'h1',
        '.video-title',
        '.media-title',
        '.movie-title',
        '.player_title',
        '[data-uia="video-title"]',
        '#title h1',
        '.title'
      ];
      for (const sel of defaultTitleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 0) {
          title = el.textContent.trim();
          if (title.length > 3) break;
        }
      }
    }
    if (!title) title = document.title;

    let season = null;
    let episode = null;
    if (matchedRule && matchedRule.episodeSelector) {
      try {
        const epSelectors = Array.isArray(matchedRule.episodeSelector)
          ? matchedRule.episodeSelector
          : matchedRule.episodeSelector.split(',').map(s => s.trim()).filter(Boolean);
        for (const sel of epSelectors) {
          try {
            const el = document.querySelector(sel);
            if (el && el.textContent) {
              const epText = el.textContent;
              const sMatch = epText.match(/第\s*(\d+)\s*季|Season\s*(\d+)/i);
              const eMatch = epText.match(/第\s*(\d+)\s*集|Episode\s*(\d+)|第\s*(\d+)\s*话|(\d+)\s*[集话]/i);
              const seMatch = epText.match(/S(\d+)E(\d+)/i);
              if (seMatch) {
                season = parseInt(seMatch[1]);
                episode = parseInt(seMatch[2]);
              } else {
                if (sMatch) season = parseInt(sMatch[1] || sMatch[2]);
                if (eMatch) episode = parseInt(eMatch[1] || eMatch[2] || eMatch[3] || eMatch[4]);
              }
              if (season || episode) break;
            }
          } catch (e) {
            console.warn('Invalid episode selector:', sel, e);
          }
        }
      } catch (e) {}
    }

    if (!season && !episode) {
      const epPatterns = [
        /第\s*(\d+)\s*[季集]/g,
        /Season\s*(\d+)/i,
        /Episode\s*(\d+)/i,
        /S(\d+)E(\d+)/i,
        /(\d+)话/,
        /(\d+)集/
      ];
      const titleText = title + ' ' + document.title;
      for (const pat of epPatterns) {
        let match;
        while ((match = pat.exec(titleText)) !== null) {
          if (match[0].includes('季') || match[0].toLowerCase().includes('season') || match[0].match(/^S\d+/i)) {
            season = parseInt(match[1]);
          } else if (match[2] && match[0].match(/^S\d+E\d+/i)) {
            season = parseInt(match[1]);
            episode = parseInt(match[2]);
          } else {
            episode = parseInt(match[1]);
          }
        }
      }
    }

    let progress = 0;
    let duration = 0;
    let videoEl = null;
    if (matchedRule && matchedRule.progressSelector) {
      try {
        videoEl = document.querySelector(matchedRule.progressSelector);
      } catch (e) {
        console.warn('Invalid progress selector:', matchedRule.progressSelector, e);
      }
    }
    if (!videoEl) {
      videoEl = document.querySelector('video');
    }
    if (videoEl) {
      progress = videoEl.currentTime || 0;
      duration = videoEl.duration || 0;
    }

    return {
      title: title.slice(0, 200),
      url: url.split('?')[0],
      fullUrl: url,
      platform,
      season,
      episode,
      progress,
      duration,
      hostname,
      matchedRuleId: matchedRule?.id || null
    };
  }

  async function getCurrentItem() {
    const videoInfo = detectVideoInfo();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'findOrCreateItem', videoInfo },
        (response) => {
          resolve(response?.item || null);
        }
      );
    });
  }

  async function sendMessage(action, data = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        resolve(response || {});
      });
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'mt-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function renderStars(rating, interactive = true) {
    if (privacyMode && !interactive) {
      return '<span style="color:#9ca3af;font-size:14px;">•••••</span>';
    }
    let html = `<div class="mt-rating ${interactive ? 'reverse' : ''}" style="flex-direction:row-reverse;display:inline-flex">`;
    for (let i = 5; i >= 1; i--) {
      const filled = i <= rating;
      html += `<span class="mt-star ${filled ? 'filled' : ''}" data-value="${i}">★</span>`;
    }
    html += '</div>';
    return html;
  }

  function renderTags() {
    if (!currentTags.length) return '';
    if (privacyMode) {
      return `<span class="mt-tag">••••<span class="mt-tag-remove" data-tag="__privacy__">×</span></span>`;
    }
    return currentTags.map(tag =>
      `<span class="mt-tag">${tag}<span class="mt-tag-remove" data-tag="${tag}">×</span></span>`
    ).join('');
  }

  function renderBookmarks() {
    if (!currentItem?.bookmarks?.length) return '<div style="color:#9ca3af;font-size:12px">暂无收藏片段</div>';
    if (privacyMode) {
      return currentItem.bookmarks.map((bm, idx) => `
        <div class="mt-bookmark-item">
          <span class="mt-bookmark-time" data-time="${bm.time}">••:••</span>
          <span class="mt-bookmark-note">••••••</span>
          <button class="mt-bookmark-remove" data-bookmark-id="${bm.id}">×</button>
        </div>
      `).join('');
    }
    return currentItem.bookmarks.map(bm => `
      <div class="mt-bookmark-item">
        <span class="mt-bookmark-time" data-time="${bm.time}">${formatTime(bm.time)}</span>
        <span class="mt-bookmark-note">${bm.note || '无备注'}</span>
        <button class="mt-bookmark-remove" data-bookmark-id="${bm.id}">×</button>
      </div>
    `).join('');
  }

  function renderReminders() {
    if (!currentItem?.reminders?.length) return '';
    const reminderContent = privacyMode
      ? currentItem.reminders.map(rem => `
          <div class="mt-reminder-item">
            <span>📅 •••••••• - ••••</span>
            <button class="mt-reminder-remove" data-reminder-id="${rem.id}">×</button>
          </div>
        `).join('')
      : currentItem.reminders.map(rem => `
          <div class="mt-reminder-item">
            <span>📅 ${new Date(rem.time).toLocaleString('zh-CN')} - ${rem.note || '下集提醒'}</span>
            <button class="mt-reminder-remove" data-reminder-id="${rem.id}">×</button>
          </div>
        `).join('');
    return `<div class="mt-reminder-list">${reminderContent}</div>`;
  }

  function renderPanel() {
    if (!overlayContainer) return;
    const videoInfo = detectVideoInfo();
    const item = currentItem || {};
    currentStatus = item.status || currentStatus;
    currentRating = item.rating || currentRating;
    currentTags = item.tags ? [...item.tags] : [];

    const progressPercent = videoInfo.duration > 0
      ? Math.min(100, (videoInfo.progress / videoInfo.duration) * 100)
      : (item.progress && item.duration ? Math.min(100, (item.progress / item.duration) * 100) : 0);

    const displayTitle = privacyMode ? maskText(videoInfo.title || '未识别到视频标题') : (videoInfo.title || '未识别到视频标题');
    const displayPlatform = privacyMode ? '🏠 ••••' : (videoInfo.platform ? '🏠 ' + videoInfo.platform : '');
    const displaySeason = privacyMode ? '' : (videoInfo.season ? ' · 第' + videoInfo.season + '季' : '');
    const displayEpisode = privacyMode ? '' : (videoInfo.episode ? ' · 第' + videoInfo.episode + '集' : '');
    const displayProgress = privacyMode ? '••:•• / ••:••' : `${formatTime(videoInfo.progress || item.progress)} / ${formatTime(videoInfo.duration || item.duration)}`;
    const displayProgressPercent = privacyMode ? 0 : progressPercent;
    const displayReview = privacyMode ? '' : (item.review || '');
    const displayReviewPlaceholder = privacyMode ? '（隐私模式已开启）' : '写下你的观后感...';
    const displaySeasonValue = privacyMode ? '' : (item.season || videoInfo.season || '');
    const displayEpisodeValue = privacyMode ? '' : (item.episode || videoInfo.episode || '');
    const displayTagPlaceholder = privacyMode ? '（隐私模式已开启）' : '输入标签后按回车';
    const displayBookmarkPlaceholder = privacyMode ? '（隐私模式已开启）' : '片段备注（可选）';
    const privacyBadge = privacyMode ? '<span style="margin-left:8px;padding:1px 6px;background:rgba(255,255,255,0.2);border-radius:4px;font-size:11px;">🔒 隐私模式</span>' : '';

    overlayContainer.innerHTML = `
      <div class="mt-panel">
        <div class="mt-panel-header">
          <span class="mt-panel-title">影视追踪${privacyBadge}</span>
          <button class="mt-panel-close">×</button>
        </div>
        <div class="mt-panel-body">
          <div class="mt-video-info">
            <div class="mt-video-title">${displayTitle}</div>
            <div class="mt-video-meta">
              ${displayPlatform}
              ${displaySeason}
              ${displayEpisode}
            </div>
          </div>

          <div class="mt-progress-section">
            <div class="mt-progress-label">
              <span>播放进度</span>
              <span>${displayProgress}</span>
            </div>
            <div class="mt-progress-bar">
              <div class="mt-progress-fill" style="width:${displayProgressPercent}%"></div>
            </div>
          </div>

          <div class="mt-status-tabs">
            <button class="mt-status-tab ${currentStatus === STATUS.WANT_TO_WATCH ? 'active' : ''}" data-status="${STATUS.WANT_TO_WATCH}">想看</button>
            <button class="mt-status-tab ${currentStatus === STATUS.WATCHING ? 'active' : ''}" data-status="${STATUS.WATCHING}">在看</button>
            <button class="mt-status-tab ${currentStatus === STATUS.COMPLETED ? 'active' : ''}" data-status="${STATUS.COMPLETED}">看完</button>
          </div>

          <div class="mt-section-title">评分</div>
          ${renderStars(currentRating)}

          <div class="mt-section-title">标签</div>
          <div class="mt-tags-input">
            ${renderTags()}
            <input type="text" id="mt-tag-input" placeholder="${displayTagPlaceholder}" ${privacyMode ? 'disabled' : ''}>
          </div>

          <div class="mt-section-title">短评</div>
          <textarea class="mt-textarea" id="mt-review-input" placeholder="${displayReviewPlaceholder}" ${privacyMode ? 'disabled' : ''}>${displayReview}</textarea>

          <div class="mt-section-title">季/集信息</div>
          <div class="mt-form-row">
            <input type="number" class="mt-input" id="mt-season-input" placeholder="季" value="${displaySeasonValue}" min="1" ${privacyMode ? 'disabled' : ''}>
            <input type="number" class="mt-input" id="mt-episode-input" placeholder="集" value="${displayEpisodeValue}" min="1" ${privacyMode ? 'disabled' : ''}>
          </div>

          <div class="mt-section-title">收藏片段</div>
          <div class="mt-bookmark-list" id="mt-bookmark-list">
            ${renderBookmarks()}
          </div>
          <div class="mt-form-row">
            <input type="text" class="mt-input" id="mt-bookmark-note" placeholder="${displayBookmarkPlaceholder}" ${privacyMode ? 'disabled' : ''}>
            <button class="mt-btn mt-btn-secondary" id="mt-add-bookmark" style="flex:0 0 auto" ${privacyMode ? 'disabled' : ''}>收藏当前时间点</button>
          </div>

          <div class="mt-section-title">下集提醒</div>
          ${renderReminders()}
          <div class="mt-form-row">
            <input type="datetime-local" class="mt-input" id="mt-reminder-time" ${privacyMode ? 'disabled' : ''}>
            <button class="mt-btn mt-btn-secondary" id="mt-add-reminder" style="flex:0 0 auto" ${privacyMode ? 'disabled' : ''}>设置提醒</button>
          </div>

          <div class="mt-button-row">
            <button class="mt-btn mt-btn-secondary" id="mt-copy-card" ${privacyMode ? 'disabled' : ''}>复制分享卡片</button>
            <button class="mt-btn mt-btn-primary" id="mt-save-btn">保存进度</button>
          </div>
        </div>
      </div>
      <button class="mt-fab" title="影视追踪">${privacyMode ? '🔒' : '📺'}</button>
    `;
    bindPanelEvents();
  }

  function bindPanelEvents() {
    const fab = overlayContainer.querySelector('.mt-fab');
    const closeBtn = overlayContainer.querySelector('.mt-panel-close');
    const panel = overlayContainer.querySelector('.mt-panel');

    if (fab) {
      fab.addEventListener('click', () => {
        panelVisible = !panelVisible;
        panel.style.display = panelVisible ? 'block' : 'none';
        if (panelVisible) {
          getCurrentItem().then(item => {
            currentItem = item;
            renderPanel();
            overlayContainer.querySelector('.mt-panel').style.display = 'block';
          });
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panelVisible = false;
        panel.style.display = 'none';
      });
    }

    overlayContainer.querySelectorAll('.mt-status-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentStatus = tab.dataset.status;
        overlayContainer.querySelectorAll('.mt-status-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });

    overlayContainer.querySelectorAll('.mt-star').forEach(star => {
      star.addEventListener('click', () => {
        currentRating = parseInt(star.dataset.value);
        overlayContainer.querySelectorAll('.mt-star').forEach(s => {
          s.classList.toggle('filled', parseInt(s.dataset.value) <= currentRating);
        });
      });
    });

    const tagInput = overlayContainer.querySelector('#mt-tag-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && tagInput.value.trim()) {
          e.preventDefault();
          const tag = tagInput.value.trim();
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
          }
          tagInput.value = '';
          overlayContainer.querySelector('.mt-tags-input').innerHTML = renderTags() +
            `<input type="text" id="mt-tag-input" placeholder="输入标签后按回车">`;
          bindPanelEvents();
          overlayContainer.querySelector('#mt-tag-input').focus();
        }
      });
    }

    overlayContainer.querySelectorAll('.mt-tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        currentTags = currentTags.filter(t => t !== tag);
        renderPanel();
        overlayContainer.querySelector('.mt-panel').style.display = 'block';
      });
    });

    overlayContainer.querySelectorAll('.mt-bookmark-time').forEach(span => {
      span.addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) {
          video.currentTime = parseFloat(span.dataset.time);
        }
      });
    });

    overlayContainer.querySelectorAll('.mt-bookmark-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bmId = btn.dataset.bookmarkId;
        if (currentItem) {
          currentItem.bookmarks = currentItem.bookmarks.filter(b => b.id !== bmId);
          const res = await sendMessage('updateItem', { id: currentItem.id, updates: { bookmarks: currentItem.bookmarks } });
          if (res.success) {
            renderPanel();
            overlayContainer.querySelector('.mt-panel').style.display = 'block';
            showToast('已删除收藏片段');
          }
        }
      });
    });

    const addBookmarkBtn = overlayContainer.querySelector('#mt-add-bookmark');
    if (addBookmarkBtn) {
      addBookmarkBtn.addEventListener('click', async () => {
        const video = document.querySelector('video');
        if (!video) {
          showToast('未找到视频元素');
          return;
        }
        const noteInput = overlayContainer.querySelector('#mt-bookmark-note');
        const bookmark = {
          id: Date.now().toString(36),
          time: video.currentTime,
          note: noteInput?.value?.trim() || '',
          createdAt: Date.now()
        };
        if (!currentItem) currentItem = await getCurrentItem();
        currentItem.bookmarks = [...(currentItem.bookmarks || []), bookmark];
        const res = await sendMessage('updateItem', { id: currentItem.id, updates: { bookmarks: currentItem.bookmarks } });
        if (res.success) {
          if (noteInput) noteInput.value = '';
          renderPanel();
          overlayContainer.querySelector('.mt-panel').style.display = 'block';
          showToast('已收藏时间点 ' + formatTime(bookmark.time));
        }
      });
    }

    overlayContainer.querySelectorAll('.mt-reminder-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const remId = btn.dataset.reminderId;
        if (currentItem) {
          currentItem.reminders = currentItem.reminders.filter(r => r.id !== remId);
          const res = await sendMessage('updateItem', { id: currentItem.id, updates: { reminders: currentItem.reminders } });
          if (res.success) {
            renderPanel();
            overlayContainer.querySelector('.mt-panel').style.display = 'block';
            showToast('已删除提醒');
          }
        }
      });
    });

    const addReminderBtn = overlayContainer.querySelector('#mt-add-reminder');
    if (addReminderBtn) {
      addReminderBtn.addEventListener('click', async () => {
        const timeInput = overlayContainer.querySelector('#mt-reminder-time');
        if (!timeInput?.value) {
          showToast('请选择提醒时间');
          return;
        }
        const reminder = {
          id: Date.now().toString(36),
          time: new Date(timeInput.value).getTime(),
          note: '追番提醒',
          createdAt: Date.now()
        };
        if (!currentItem) currentItem = await getCurrentItem();
        currentItem.reminders = [...(currentItem.reminders || []), reminder];
        const res = await sendMessage('updateItem', {
          id: currentItem.id,
          updates: { reminders: currentItem.reminders },
          createAlarm: true,
          alarmData: { id: reminder.id, time: reminder.time, title: currentItem.title }
        });
        if (res.success) {
          renderPanel();
          overlayContainer.querySelector('.mt-panel').style.display = 'block';
          showToast('已设置提醒');
        }
      });
    }

    const copyCardBtn = overlayContainer.querySelector('#mt-copy-card');
    if (copyCardBtn) {
      copyCardBtn.addEventListener('click', async () => {
        const review = overlayContainer.querySelector('#mt-review-input')?.value || '';
        const season = overlayContainer.querySelector('#mt-season-input')?.value || '';
        const episode = overlayContainer.querySelector('#mt-episode-input')?.value || '';
        const res = await sendMessage('generateShareCard', {
          item: {
            ...currentItem,
            status: currentStatus,
            rating: currentRating,
            tags: currentTags,
            review,
            season: season ? parseInt(season) : null,
            episode: episode ? parseInt(episode) : null
          }
        });
        if (res.card) {
          try {
            await navigator.clipboard.writeText(res.card);
            showToast('分享卡片已复制到剪贴板');
          } catch {
            showToast('复制失败');
          }
        }
      });
    }

    const saveBtn = overlayContainer.querySelector('#mt-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const review = overlayContainer.querySelector('#mt-review-input')?.value || '';
        const season = overlayContainer.querySelector('#mt-season-input')?.value || '';
        const episode = overlayContainer.querySelector('#mt-episode-input')?.value || '';
        const videoInfo = detectVideoInfo();

        saveBtn.innerHTML = '<span class="mt-loading"></span>';
        saveBtn.disabled = true;

        if (!currentItem) currentItem = await getCurrentItem();
        const res = await sendMessage('updateItem', {
          id: currentItem.id,
          updates: {
            status: currentStatus,
            rating: currentRating,
            tags: currentTags,
            review,
            season: season ? parseInt(season) : null,
            episode: episode ? parseInt(episode) : null,
            progress: videoInfo.progress || currentItem.progress,
            duration: videoInfo.duration || currentItem.duration,
            lastWatchedAt: Date.now()
          }
        });

        saveBtn.innerHTML = '保存进度';
        saveBtn.disabled = false;

        if (res.success) {
          currentItem = res.item;
          showToast('进度已保存');
        } else {
          showToast('保存失败');
        }
      });
    }
  }

  function createOverlay() {
    if (overlayContainer) return;
    overlayContainer = document.createElement('div');
    overlayContainer.className = 'mt-overlay';
    document.body.appendChild(overlayContainer);
    renderPanel();
    overlayContainer.querySelector('.mt-panel').style.display = 'none';
  }

  function loadSettings() {
    chrome.storage.local.get(['tracker_settings', 'tracker_site_rules'], (result) => {
      const settings = result.tracker_settings || {};
      const oldPrivacy = privacyMode;
      privacyMode = settings.privacyMode === true;

      if (result.tracker_site_rules && Array.isArray(result.tracker_site_rules)) {
        siteRules = result.tracker_site_rules;
      }

      settingsLoaded = true;

      if (settings.showOverlay !== false) {
        if (!overlayContainer) {
          createOverlay();
        } else {
          overlayContainer.style.display = '';
          if (oldPrivacy !== privacyMode) {
            renderPanel();
            overlayContainer.querySelector('.mt-panel').style.display = panelVisible ? 'block' : 'none';
          }
        }
      } else if (overlayContainer) {
        overlayContainer.style.display = 'none';
      }
    });
  }

  function init() {
    loadSettings();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.tracker_settings || changes.tracker_site_rules) {
          loadSettings();
        }
      }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'getVideoInfo') {
        sendResponse(detectVideoInfo());
      } else if (msg.action === 'toggleOverlay') {
        if (overlayContainer) {
          overlayContainer.style.display = overlayContainer.style.display === 'none' ? '' : 'none';
        }
      } else if (msg.action === 'saveCurrentProgress') {
        getCurrentItem().then(async (item) => {
          const videoInfo = detectVideoInfo();
          const res = await sendMessage('updateItem', {
            id: item.id,
            updates: {
              progress: videoInfo.progress,
              duration: videoInfo.duration,
              lastWatchedAt: Date.now()
            }
          });
          sendResponse(res);
        });
        return true;
      }
    });

    const video = document.querySelector('video');
    if (video) {
      let saveTimeout;
      video.addEventListener('timeupdate', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          if (currentItem) {
            await sendMessage('updateItem', {
              id: currentItem.id,
              updates: {
                progress: video.currentTime,
                duration: video.duration,
                lastWatchedAt: Date.now()
              },
              silent: true
            });
          }
        }, 5000);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

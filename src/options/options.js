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
  try {
    const text = await file.text();
    const preview = await previewImport(text);
    if (!preview.valid) {
      showToast('导入失败：文件格式错误 - ' + preview.error);
      return;
    }

    const diff = (cur, imp) => {
      if (imp > cur) return `(+${imp - cur})`;
      if (imp < cur) return `(${imp - cur})`;
      return '(不变)';
    };

    const message = `即将导入备份数据：

📦 导出于：${preview.exportedAt}（版本 ${preview.version}）

📽 作品：当前 ${preview.items.current} 条 → 导入 ${preview.items.importing} 条 ${diff(preview.items.current, preview.items.importing)}
🌐 规则：当前 ${preview.rules.current} 条 → 导入 ${preview.rules.importing} 条 ${diff(preview.rules.current, preview.rules.importing)}
📜 历史：当前 ${preview.history.current} 条 → 导入 ${preview.history.importing} 条 ${diff(preview.history.current, preview.history.importing)}
🕒 变更日志：当前 ${preview.changeLogs.current} 条 → 导入 ${preview.changeLogs.importing} 条 ${diff(preview.changeLogs.current, preview.changeLogs.importing)}
🧪 测试记录：当前 ${preview.ruleTests.current} 条 → 导入 ${preview.ruleTests.importing} 条 ${diff(preview.ruleTests.current, preview.ruleTests.importing)}

⚠️ 导入后现有数据将被完全覆盖，确定继续吗？`;

    if (!confirm(message)) return;

    const result = await importData(text);
    if (result.success) {
      showToast('数据导入成功');
      await loadSettings();
      await loadSiteRules();
      await loadReminders();
    } else {
      showToast('导入失败：' + (result.error || '未知错误'));
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

  if (!history || !history.length) {
    container.innerHTML = `
      <div class="empty-history" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;opacity:0.3;margin-bottom:12px;">📭</div>
        <div style="color:var(--text-muted);font-size:14px;">暂无历史记录</div>
      </div>`;
  } else {
    const typeIcons = { add: '➕', update: '✏️', delete: '🗑️' };
    const typeLabels = { add: '添加', update: '更新', delete: '删除' };
    const safeHistory = Array.isArray(history) ? history : [];
    container.innerHTML = safeHistory.map(h => `
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

async function handleClearHistory() {
  if (!confirm('确定要清除所有历史记录吗？此操作不可撤销。')) return;
  try {
    const { clearHistory: doClearHistory } = window;
    if (typeof doClearHistory === 'function') {
      await doClearHistory();
    } else {
      await setStorage('tracker_history', []);
    }
    showToast('历史记录已清除');
    if (document.getElementById('history-modal').style.display === 'flex') {
      await viewHistory();
    }
  } catch (e) {
    console.error('清除历史失败:', e);
    showToast('清除失败，请重试');
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function matchRuleForUrl(rules, url) {
  const hostname = getHostname(url);
  if (!hostname) return null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const matches = Array.isArray(rule.match) ? rule.match : [rule.match];
    for (const m of matches) {
      const mm = (m || '').trim().replace(/^www\./, '');
      if (!mm) continue;
      if (hostname === mm || hostname.endsWith('.' + mm)) {
        return rule;
      }
    }
  }
  return null;
}

async function testCurrentTab() {
  const resultContainer = document.getElementById('test-result');
  resultContainer.style.display = 'block';
  resultContainer.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">🔍 正在检测当前标签页…</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('找不到当前标签页');
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      throw new Error('当前页面是浏览器内部页面，无法注入脚本');
    }

    document.getElementById('test-url').value = tab.url || '';

    const rules = await getSiteRules();
    const matchedRule = matchRuleForUrl(rules, tab.url);

    const [detectionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (ruleJson) => {
        const rule = ruleJson ? JSON.parse(ruleJson) : null;
        const trySelector = (selector) => {
          if (!selector) return { success: false, reason: '选择器为空' };
          try {
            const list = Array.isArray(selector) ? selector : String(selector).split(',').map(s => s.trim()).filter(Boolean);
            for (const sel of list) {
              if (!sel) continue;
              try {
                const el = document.querySelector(sel);
                if (el) {
                  const text = (el.innerText || el.textContent || '').trim();
                  if (text) return { success: true, value: text, selector: sel };
                }
              } catch { /* ignore */ }
            }
            return { success: false, reason: '所有选择器都没匹配到元素，或匹配到的元素为空文本' };
          } catch (e) {
            return { success: false, reason: '解析选择器出错: ' + e.message };
          }
        };

        const tryVideo = (selector) => {
          if (!selector) return { success: false, reason: '未配置progress选择器' };
          try {
            const list = Array.isArray(selector) ? selector : String(selector).split(',').map(s => s.trim()).filter(Boolean);
            for (const sel of list) {
              const el = document.querySelector(sel);
              if (el && el.tagName === 'VIDEO') {
                return { success: true, selector: sel, value: { currentTime: el.currentTime || 0, duration: el.duration || 0 } };
              }
            }
            const videos = document.querySelectorAll('video');
            for (const v of videos) {
              if (v.duration) {
                return { success: true, selector: 'video (fallback)', value: { currentTime: v.currentTime || 0, duration: v.duration || 0 } };
              }
            }
            return { success: false, reason: '未找到video元素，或video未加载' };
          } catch (e) {
            return { success: false, reason: '查找video出错: ' + e.message };
          }
        };

        const parseSeasonEpisode = (text) => {
          if (!text) return { season: null, episode: null };
          const s = text.match(/第\s*(\d+)\s*季|S(\d+)/i);
          const e = text.match(/第\s*(\d+)\s*[集话]|E(\d+)/i);
          return {
            season: s ? parseInt(s[1] || s[2]) : null,
            episode: e ? parseInt(e[1] || e[2]) : null
          };
        };

        let titleResult = { success: false, reason: '无规则' };
        let epResult = { success: false, reason: '无规则' };
        let progResult = { success: false, reason: '无规则' };
        let epText = null;

        if (rule) {
          titleResult = trySelector(rule.titleSelector);
          epResult = trySelector(rule.episodeSelector);
          progResult = tryVideo(rule.progressSelector);
          epText = epResult.success ? epResult.value : null;
        }

        if (!titleResult.success) {
          const fallback = trySelector('h1, .video-title, .title, .media-title');
          if (fallback.success) titleResult = { ...fallback, fallback: true };
        }

        const seasonEpisode = parseSeasonEpisode(epText || (titleResult.success ? titleResult.value : '') || document.title);

        return {
          title: titleResult,
          episode: epResult,
          progress: progResult,
          season: seasonEpisode.season,
          episodeNum: seasonEpisode.episode,
          pageTitle: document.title
        };
      },
      args: [matchedRule ? JSON.stringify(matchedRule) : null]
    });

    const detect = detectionResult?.result || {};
    const finalResult = {
      url: tab.url,
      hostname: getHostname(tab.url),
      matchedRule: matchedRule ? { id: matchedRule.id, name: matchedRule.name } : null,
      ruleSelectors: matchedRule ? {
        title: matchedRule.titleSelector || '(未配置)',
        episode: matchedRule.episodeSelector || '(未配置)',
        progress: matchedRule.progressSelector || '(未配置)'
      } : null,
      detection: detect,
      success: detect.title?.success || !!detect.pageTitle
    };

    await addRuleTest(finalResult);
    renderTestResult(finalResult);
  } catch (e) {
    console.error(e);
    renderTestResult({ error: e.message || String(e) });
  }
}

function testUrlStatic(urlInput) {
  const resultContainer = document.getElementById('test-result');
  resultContainer.style.display = 'block';

  if (!urlInput) {
    renderTestResult({ error: '请输入要测试的URL，或直接点击"测试当前页"' });
    return;
  }

  const hostname = getHostname(urlInput);
  if (!hostname) {
    renderTestResult({ error: 'URL格式不正确，无法解析域名' });
    return;
  }

  (async () => {
    const rules = await getSiteRules();
    const matchedRule = matchRuleForUrl(rules, urlInput);
    const result = {
      staticOnly: true,
      url: urlInput,
      hostname,
      matchedRule: matchedRule ? { id: matchedRule.id, name: matchedRule.name, enabled: matchedRule.enabled } : null,
      ruleSelectors: matchedRule ? {
        title: matchedRule.titleSelector || '(未配置)',
        episode: matchedRule.episodeSelector || '(未配置)',
        progress: matchedRule.progressSelector || '(未配置)'
      } : null,
      hint: matchedRule
        ? '域名匹配成功！但无法在设置页验证页面DOM，建议打开该页面后点击"测试当前页"查看实际识别结果。'
        : '没有任何已启用的规则匹配该域名，请添加对应站点规则。'
    };
    await addRuleTest(result);
    renderTestResult(result);
  })();
}

function renderTestResult(result) {
  const container = document.getElementById('test-result');
  if (result.error) {
    container.innerHTML = `
      <div style="padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:var(--radius-md);color:#991b1b;font-size:13px;">
        ❌ 测试失败：${result.error}
      </div>`;
    return;
  }

  let html = '';
  const cardHeader = (title, icon = '📋') => `<div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-bottom:8px;">${icon} ${title}</div>`;

  if (result.staticOnly) {
    html += `<div style="padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:var(--radius-md);font-size:13px;color:#92400e;margin-bottom:12px;">
      ℹ️ ${result.hint || ''}
    </div>`;
  }

  html += `<div style="padding:14px 16px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);">`;
  html += cardHeader('基本信息', '🔗');
  html += `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;"><b>URL：</b>${result.url || '-'}</div>`;
  html += `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;"><b>域名：</b>${result.hostname || '-'}</div>`;

  html += `<div style="border-top:1px dashed var(--border-color);padding-top:10px;margin-top:6px">`;
  html += cardHeader('规则匹配', '🎯');
  if (result.matchedRule) {
    html += `<div style="padding:8px 12px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:var(--radius-sm);font-size:13px;">
      ✅ 匹配规则：<b>${result.matchedRule.name}</b>（ID: ${result.matchedRule.id}）
    </div>`;
    if (result.ruleSelectors) {
      html += `<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">
        <div><b>标题选择器：</b><code style="background:var(--bg-primary);padding:1px 6px;border-radius:4px;">${result.ruleSelectors.title}</code></div>
        <div style="margin-top:4px"><b>季集选择器：</b><code style="background:var(--bg-primary);padding:1px 6px;border-radius:4px;">${result.ruleSelectors.episode}</code></div>
        <div style="margin-top:4px"><b>进度选择器：</b><code style="background:var(--bg-primary);padding:1px 6px;border-radius:4px;">${result.ruleSelectors.progress}</code></div>
      </div>`;
    }
  } else {
    html += `<div style="padding:8px 12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-sm);font-size:13px;color:#991b1b;">
      ❌ 没有匹配的规则
    </div>`;
  }
  html += `</div>`;

  if (result.detection) {
    html += `<div style="border-top:1px dashed var(--border-color);padding-top:10px;margin-top:10px">`;
    html += cardHeader('实际识别结果', '🔍');

    const renderField = (label, fieldResult, parser) => {
      if (!fieldResult) return '';
      if (fieldResult.success) {
        const val = parser ? parser(fieldResult.value) : (typeof fieldResult.value === 'string' ? fieldResult.value : JSON.stringify(fieldResult.value));
        return `<div style="font-size:13px;margin-top:4px;padding:6px 10px;background:rgba(34,197,94,0.06);border-radius:4px;">
          <b>${label}：</b><span style="color:var(--success-color);">${val}</span>
          ${fieldResult.selector ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">匹配选择器：<code style="background:var(--bg-primary);padding:1px 5px;border-radius:3px;">${fieldResult.selector}</code>${fieldResult.fallback ? '（回退默认）' : ''}</div>` : ''}
        </div>`;
      } else {
        return `<div style="font-size:13px;margin-top:4px;padding:6px 10px;background:rgba(239,68,68,0.05);border-radius:4px;">
          <b>${label}：</b><span style="color:#991b1b;">❌ 失败</span>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">原因：${fieldResult.reason || '未知'}</div>
        </div>`;
      }
    };

    html += renderField('标题', result.detection.title);
    html += renderField('季集文本', result.detection.episode);
    if (result.detection.season || result.detection.episodeNum) {
      html += `<div style="font-size:13px;margin-top:4px;padding:6px 10px;background:rgba(59,130,246,0.06);border-radius:4px;">
        <b>解析季/集：</b>第${result.detection.season || '?'}季 / 第${result.detection.episodeNum || '?'}集
      </div>`;
    }
    html += renderField('播放进度', result.detection.progress, v => {
      if (!v) return '无';
      const fmt = s => {
        if (!s) return '00:00';
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      };
      return `${fmt(v.currentTime)} / ${fmt(v.duration)}${v.duration ? ` (${Math.round(v.currentTime / v.duration * 100)}%)` : ''}`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
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
  document.getElementById('clear-history-btn').addEventListener('click', handleClearHistory);
  document.getElementById('history-modal-close').addEventListener('click', () => {
    document.getElementById('history-modal').style.display = 'none';
  });
  document.getElementById('history-modal').addEventListener('click', (e) => {
    if (e.target.id === 'history-modal') {
      document.getElementById('history-modal').style.display = 'none';
    }
  });

  document.getElementById('test-current-tab').addEventListener('click', testCurrentTab);
  document.getElementById('test-rule-btn').addEventListener('click', () => {
    const url = document.getElementById('test-url').value.trim();
    if (!url) {
      testCurrentTab();
    } else {
      testUrlStatic(url);
    }
  });
});

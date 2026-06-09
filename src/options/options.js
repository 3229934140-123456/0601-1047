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

async function detectInTab(tabId, matchedRule) {
  const [detectionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (ruleJson) => {
      const rule = ruleJson ? JSON.parse(ruleJson) : null;
      const trySelector = (selector) => {
        if (!selector) return { success: false, reason: '选择器为空' };
        try {
          const list = Array.isArray(selector) ? selector : String(selector).split(',').map(s => s.trim()).filter(Boolean);
          const tried = [];
          for (const sel of list) {
            if (!sel) continue;
            tried.push(sel);
            try {
              const el = document.querySelector(sel);
              if (el) {
                const text = (el.innerText || el.textContent || '').trim();
                if (text) return { success: true, value: text, selector: sel, tried };
              }
            } catch (e) {
              return { success: false, reason: `选择器语法错误「${sel}」: ${e.message}`, tried };
            }
          }
          return {
            success: false,
            reason: tried.length
              ? `尝试了 ${tried.length} 个选择器（${tried.join(' , ')}），但均未匹配到有文本内容的元素`
              : '选择器列表为空',
            tried
          };
        } catch (e) {
          return { success: false, reason: '解析选择器出错: ' + e.message };
        }
      };

      const tryVideo = (selector) => {
        if (!selector) return { success: false, reason: '未配置progress选择器' };
        try {
          const list = Array.isArray(selector) ? selector : String(selector).split(',').map(s => s.trim()).filter(Boolean);
          const tried = [];
          for (const sel of list) {
            if (!sel) continue;
            tried.push(sel);
            const el = document.querySelector(sel);
            if (el && el.tagName === 'VIDEO') {
              return { success: true, selector: sel, tried, value: { currentTime: el.currentTime || 0, duration: el.duration || 0 } };
            }
          }
          const videos = document.querySelectorAll('video');
          for (const v of videos) {
            if (v.duration) {
              return { success: true, selector: 'video (fallback)', tried, value: { currentTime: v.currentTime || 0, duration: v.duration || 0 } };
            }
          }
          return {
            success: false,
            tried,
            reason: videos.length
              ? `页面上有 ${videos.length} 个 <video> 元素，但都还没加载出时长（duration = NaN / 0），可能还在缓冲或该页面是纯直播`
              : '页面中完全没有找到 <video> 元素'
          };
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

      let titleResult = { success: false, reason: '无匹配规则' };
      let epResult = { success: false, reason: '无匹配规则' };
      let progResult = { success: false, reason: '无匹配规则' };
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
        pageTitle: document.title,
        pageUrl: location.href
      };
    },
    args: [matchedRule ? JSON.stringify(matchedRule) : null]
  });
  return detectionResult?.result || null;
}

function waitForTabReady(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ready: false, reason: `等待页面加载超时（${timeout / 1000}s）` });
    }, timeout);

    function onUpdated(updatedId, info) {
      if (updatedId !== tabId) return;
      if (info.status === 'complete') {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        setTimeout(() => resolve({ ready: true }), 600);
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
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
    const step1 = {
      success: !!matchedRule,
      hostname: getHostname(tab.url),
      matchedRule: matchedRule ? { id: matchedRule.id, name: matchedRule.name } : null,
      ruleSelectors: matchedRule ? {
        title: matchedRule.titleSelector || '(未配置)',
        episode: matchedRule.episodeSelector || '(未配置)',
        progress: matchedRule.progressSelector || '(未配置)'
      } : null,
      hint: matchedRule
        ? `域名匹配成功，使用规则「${matchedRule.name}」`
        : '没有任何已启用的规则匹配这个域名'
    };

    const step2 = { success: true, mode: '直接使用当前活动标签页' };
    const detection = matchedRule
      ? await detectInTab(tab.id, matchedRule)
      : { pageTitle: tab.title || '', title: { success: false, reason: '因为没有匹配到站点规则，已跳过注入检测' }, episode: null, progress: null };

    const finalResult = {
      url: tab.url,
      step1, step2,
      step3: { detection }
    };

    await addRuleTest(finalResult);
    renderTestResult(finalResult);
  } catch (e) {
    console.error(e);
    renderTestResult({ error: e.message || String(e) });
  }
}

async function testUrlStatic(urlInput) {
  const resultContainer = document.getElementById('test-result');
  resultContainer.style.display = 'block';

  if (!urlInput) {
    renderTestResult({ error: '请输入要测试的URL，或直接点击"测试当前页"' });
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlInput);
  } catch {
    renderTestResult({ error: 'URL格式不正确，无法解析域名，请确认是否包含 http:// 或 https://' });
    return;
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    renderTestResult({ error: `只支持 http:// 或 https:// URL（当前协议：${parsedUrl.protocol}）` });
    return;
  }

  resultContainer.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px">🔍 正在后台打开页面并检测（约需 3-10 秒）…</div>';

  const rules = await getSiteRules();
  const matchedRule = matchRuleForUrl(rules, urlInput);
  const step1 = {
    success: !!matchedRule,
    hostname: getHostname(urlInput),
    matchedRule: matchedRule ? { id: matchedRule.id, name: matchedRule.name } : null,
    ruleSelectors: matchedRule ? {
      title: matchedRule.titleSelector || '(未配置)',
      episode: matchedRule.episodeSelector || '(未配置)',
      progress: matchedRule.progressSelector || '(未配置)'
    } : null,
    hint: matchedRule
      ? `域名匹配成功，使用规则「${matchedRule.name}」`
      : '没有任何已启用的规则匹配这个域名'
  };

  if (!matchedRule) {
    const result = {
      url: urlInput,
      step1,
      step2: { success: false, skipped: true, hint: '因未匹配到站点规则，已跳过页面访问。可先添加该域名的自定义规则再测' },
      step3: { detection: null }
    };
    await addRuleTest(result);
    renderTestResult(result);
    return;
  }

  let newTab = null;
  let step2;
  let detection = null;

  try {
    newTab = await chrome.tabs.create({ url: urlInput, active: false });
    const ready = await waitForTabReady(newTab.id, 20000);
    if (!ready.ready) {
      step2 = { success: false, hint: ready.reason + '；可尝试：1）直接打开该页面后再点"测试当前页" 2）检查该URL是否需要登录或被网络拦截' };
    } else {
      step2 = { success: true, mode: '已在后台打开新标签页并等待加载完成，检测完成后已自动关闭' };
      try {
        detection = await detectInTab(newTab.id, matchedRule);
      } catch (injectErr) {
        step2 = { success: false, hint: '页面已加载但无法注入脚本：' + injectErr.message + '；可尝试：1）刷新该页面后直接测试当前页 2）检查该域名是否在 host_permissions 白名单内' };
      }
    }
  } catch (e) {
    step2 = { success: false, hint: '无法打开标签页：' + e.message + '；可尝试：1）先手动打开该页面再点"测试当前页" 2）确认URL可以在浏览器中正常访问' };
  } finally {
    if (newTab && newTab.id) {
      try { await chrome.tabs.remove(newTab.id); } catch { /* ignore */ }
    }
  }

  const finalResult = { url: urlInput, step1, step2, step3: { detection } };
  await addRuleTest(finalResult);
  renderTestResult(finalResult);
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

  const stepCard = (stepNum, stepTitle, ok, body, extra) => `
    <div style="margin-top:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:${ok ? 'var(--success-color)' : 'var(--danger-color)'};color:white;">${stepNum}</span>
        <span style="font-weight:600;font-size:14px;color:var(--text-primary);">${stepTitle}</span>
        <span style="font-size:12px;color:${ok ? 'var(--success-color)' : 'var(--danger-color)'};margin-left:4px;">${ok ? '✅ 通过' : '❌ 失败'}</span>
      </div>
      <div style="margin-left:30px;padding:10px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:13px;color:var(--text-secondary);line-height:1.6;">
        ${body}
        ${extra ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-color);">${extra}</div>` : ''}
      </div>
    </div>`;

  let html = '';
  html += `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">📍 测试URL：<code style="background:var(--bg-secondary);padding:1px 6px;border-radius:4px;">${result.url || '-'}</code></div>`;

  if (result.step1) {
    const s = result.step1;
    let body = `<div><b>域名：</b>${s.hostname || '-'}</div>`;
    if (s.matchedRule) {
      body += `<div style="margin-top:4px;"><b>命中规则：</b><span style="color:var(--success-color);font-weight:600">${s.matchedRule.name}</span>（ID: ${s.matchedRule.id}）</div>`;
      if (s.ruleSelectors) {
        body += `<div style="margin-top:6px;">
          <div><b>标题选择器：</b><code style="background:var(--bg-primary);padding:1px 5px;border-radius:3px;">${s.ruleSelectors.title}</code></div>
          <div style="margin-top:2px;"><b>季集选择器：</b><code style="background:var(--bg-primary);padding:1px 5px;border-radius:3px;">${s.ruleSelectors.episode}</code></div>
          <div style="margin-top:2px;"><b>进度选择器：</b><code style="background:var(--bg-primary);padding:1px 5px;border-radius:3px;">${s.ruleSelectors.progress}</code></div>
        </div>`;
      }
    }
    let extra;
    if (!s.success) {
      extra = `<div style="color:var(--danger-color);"><b>下一步建议：</b>到上方添加该域名的自定义站点规则，配置标题/季集/进度选择器后再测。</div>`;
    }
    html += stepCard(1, '域名匹配', s.success, body, extra);
  }

  if (result.step2) {
    const s = result.step2;
    let body = '';
    if (s.skipped) body = `<div>${s.hint || '已跳过'}</div>`;
    else if (s.success) body = `<div>${s.mode || '页面访问成功'}</div>`;
    else body = `<div style="color:var(--danger-color);">${s.hint || '访问失败'}</div>`;
    let extra;
    if (!s.success && !s.skipped) {
      extra = `<div style="color:var(--warning-color);"><b>下一步建议：</b>1）先手动打开该页面，确认可以正常访问后再点「测试当前页」；2）如果站点需要登录，请先在该页面登录后再测；3）如果是纯动态渲染站点，可适当增加等待或在「测试当前页」里直接测。</div>`;
    }
    html += stepCard(2, '页面读取', !!s.success, body, extra);
  }

  if (result.step3) {
    const s = result.step3;
    const detect = s.detection;
    const ok = detect && (detect.title?.success || detect.pageTitle);
    let body = '';
    let extra = '';

    if (!detect) {
      body = `<div style="color:var(--text-muted);">因前一步未通过，已跳过选择器识别。</div>`;
    } else {
      const renderField = (label, fieldResult, parser) => {
        if (!fieldResult) return '';
        if (fieldResult.success) {
          const val = parser ? parser(fieldResult.value) : (typeof fieldResult.value === 'string' ? fieldResult.value : JSON.stringify(fieldResult.value));
          return `<div style="margin-top:5px;padding:5px 8px;background:rgba(34,197,94,0.06);border-radius:4px;">
            <b>${label}：</b><span style="color:var(--success-color);">${val}</span>
            ${fieldResult.selector ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">命中选择器：<code style="background:var(--bg-primary);padding:1px 5px;border-radius:3px;">${fieldResult.selector}</code>${fieldResult.fallback ? '（回退默认）' : ''}</div>` : ''}
          </div>`;
        } else {
          return `<div style="margin-top:5px;padding:5px 8px;background:rgba(239,68,68,0.05);border-radius:4px;">
            <b>${label}：</b><span style="color:#991b1b;">❌ 未命中</span>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">原因：${fieldResult.reason || '未知'}</div>
          </div>`;
        }
      };

      body += renderField('标题', detect.title);
      body += renderField('季集文本', detect.episode);
      if (detect.season || detect.episodeNum) {
        body += `<div style="margin-top:5px;padding:5px 8px;background:rgba(59,130,246,0.06);border-radius:4px;"><b>解析季/集：</b>第${detect.season || '?'}季 / 第${detect.episodeNum || '?'}集</div>`;
      }
      body += renderField('播放进度', detect.progress, v => {
        if (!v) return '无';
        const fmt = s => {
          if (!s) return '00:00';
          const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
          return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        };
        return `${fmt(v.currentTime)} / ${fmt(v.duration)}${v.duration ? ` (${Math.round(v.currentTime / v.duration * 100)}%)` : ''}`;
      });
      if (detect.pageTitle) {
        body += `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">（document.title：${detect.pageTitle || '-'}）</div>`;
      }

      const allFail = detect.title && !detect.title.success && detect.episode && !detect.episode.success;
      if (allFail) {
        extra = `<div style="color:var(--warning-color);"><b>下一步建议：</b>打开 DevTools → Elements 面板，用 document.querySelector 手动检查你写的选择器是否能找到元素；若页面是 iframe 内播放，请把选择器写在 iframe 所在文档层级。</div>`;
      }
    }
    html += stepCard(3, '选择器命中', ok, body, extra);
  }

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

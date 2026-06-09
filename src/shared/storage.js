const STORAGE_KEYS = {
  ITEMS: 'tracker_items',
  SETTINGS: 'tracker_settings',
  HISTORY: 'tracker_history',
  SITE_RULES: 'tracker_site_rules'
};

const STATUS = {
  WANT_TO_WATCH: 'want_to_watch',
  WATCHING: 'watching',
  COMPLETED: 'completed'
};

const STATUS_LABELS = {
  [STATUS.WANT_TO_WATCH]: '想看',
  [STATUS.WATCHING]: '在看',
  [STATUS.COMPLETED]: '看完'
};

const DEFAULT_SETTINGS = {
  reminderTime: '20:00',
  privacyMode: false,
  exportFormat: 'json',
  autoDetect: true,
  showOverlay: true,
  notificationEnabled: true
};

const DEFAULT_SITE_RULES = [
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    match: ['bilibili.com'],
    titleSelector: '.media-title, .video-title, h1',
    episodeSelector: '.ep-info, .list-box a.ep-item.cursor.visited, .bangumi-pagination',
    progressSelector: 'video',
    enabled: true
  },
  {
    id: 'iqiyi',
    name: '爱奇艺',
    match: ['iqiyi.com'],
    titleSelector: '.movie-title, .video-title, h1',
    episodeSelector: '.album-tab-list, .episode-item',
    progressSelector: 'video',
    enabled: true
  },
  {
    id: 'youku',
    name: '优酷',
    match: ['youku.com'],
    titleSelector: '.title, .video-title, h1',
    episodeSelector: '.panel-episode, .episode-item',
    progressSelector: 'video',
    enabled: true
  },
  {
    id: 'tencent',
    name: '腾讯视频',
    match: ['v.qq.com'],
    titleSelector: '.video_title, .player_title, h1',
    episodeSelector: ['mod_playlist, .episode_item'],
    progressSelector: 'video',
    enabled: true
  },
  {
    id: 'youtube',
    name: 'YouTube',
    match: ['youtube.com'],
    titleSelector: '#title h1, .ytd-video-primary-info-renderer h1',
    episodeSelector: '',
    progressSelector: 'video',
    enabled: true
  },
  {
    id: 'netflix',
    name: 'Netflix',
    match: ['netflix.com'],
    titleSelector: '[data-uia="video-title"], .title, h1',
    episodeSelector: '.episode-container, .title_card',
    progressSelector: 'video',
    enabled: true
  }
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
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

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function formatDateTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${formatDate(timestamp)} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function getPlatformName(hostname) {
  for (const rule of DEFAULT_SITE_RULES) {
    if (rule.match.some(m => hostname.includes(m.replace('.', '\\.').replace('*', '.*'))) ||
        rule.match.some(m => hostname.includes(m))) {
      return rule.name;
    }
  }
  return hostname;
}

async function getStorage(key, defaultValue = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

async function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

async function getItems() {
  return getStorage(STORAGE_KEYS.ITEMS, []);
}

async function saveItems(items) {
  return setStorage(STORAGE_KEYS.ITEMS, items);
}

async function getItemById(id) {
  const items = await getItems();
  return items.find(item => item.id === id);
}

async function addItem(itemData) {
  const items = await getItems();
  const newItem = {
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastWatchedAt: null,
    bookmarks: [],
    reminders: [],
    ...itemData
  };
  items.unshift(newItem);
  await saveItems(items);
  await addHistory({ type: 'add', itemId: newItem.id, itemTitle: newItem.title });
  return newItem;
}

async function updateItem(id, updates) {
  const items = await getItems();
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return null;
  items[index] = {
    ...items[index],
    ...updates,
    updatedAt: Date.now()
  };
  await saveItems(items);
  return items[index];
}

async function deleteItem(id) {
  const items = await getItems();
  const filtered = items.filter(item => item.id !== id);
  await saveItems(filtered);
  return true;
}

async function findItemByUrl(url) {
  const items = await getItems();
  return items.find(item => item.url && url && (item.url === url || url.includes(item.url) || item.url.includes(url)));
}

async function findOrCreateItem(videoInfo) {
  let item = null;
  if (videoInfo.url) {
    item = await findItemByUrl(videoInfo.url);
  }
  if (!item && videoInfo.title) {
    const items = await getItems();
    item = items.find(i => i.title === videoInfo.title && i.platform === videoInfo.platform);
  }
  if (!item) {
    item = await addItem({
      title: videoInfo.title || '未知作品',
      url: videoInfo.url || '',
      platform: videoInfo.platform || '',
      season: videoInfo.season || null,
      episode: videoInfo.episode || null,
      progress: videoInfo.progress || 0,
      duration: videoInfo.duration || 0,
      status: STATUS.WATCHING,
      rating: 0,
      review: '',
      tags: []
    });
  }
  return item;
}

async function getSettings() {
  const settings = await getStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function saveSettings(settings) {
  return setStorage(STORAGE_KEYS.SETTINGS, settings);
}

async function getSiteRules() {
  const rules = await getStorage(STORAGE_KEYS.SITE_RULES, DEFAULT_SITE_RULES);
  return rules;
}

async function saveSiteRules(rules) {
  return setStorage(STORAGE_KEYS.SITE_RULES, rules);
}

async function getHistory() {
  return getStorage(STORAGE_KEYS.HISTORY, []);
}

async function addHistory(entry) {
  const history = await getHistory();
  history.unshift({
    id: generateId(),
    timestamp: Date.now(),
    ...entry
  });
  if (history.length > 500) {
    history.length = 500;
  }
  return setStorage(STORAGE_KEYS.HISTORY, history);
}

async function clearHistory() {
  return setStorage(STORAGE_KEYS.HISTORY, []);
}

async function exportData(format = 'json') {
  const items = await getItems();
  const settings = await getSettings();
  const siteRules = await getSiteRules();
  const data = {
    exportedAt: Date.now(),
    version: '1.0.0',
    items,
    settings,
    siteRules
  };
  
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  } else if (format === 'csv') {
    const headers = ['标题', '平台', '状态', '季', '集', '评分', '标签', '进度', '评论', '创建时间', '更新时间'];
    const rows = items.map(item => [
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.platform || '').replace(/"/g, '""')}"`,
      STATUS_LABELS[item.status] || '',
      item.season || '',
      item.episode || '',
      item.rating || 0,
      `"${(item.tags || []).join(', ')}"`,
      formatTime(item.progress || 0),
      `"${(item.review || '').replace(/"/g, '""')}"`,
      formatDateTime(item.createdAt),
      formatDateTime(item.updatedAt)
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
  return JSON.stringify(data, null, 2);
}

async function importData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    if (data.items) {
      await saveItems(data.items);
    }
    if (data.settings) {
      await saveSettings(data.settings);
    }
    if (data.siteRules) {
      await saveSiteRules(data.siteRules);
    }
    return true;
  } catch (e) {
    console.error('Import failed:', e);
    return false;
  }
}

function generateShareCard(item) {
  const statusText = STATUS_LABELS[item.status] || '';
  const stars = item.rating ? '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating) : '';
  const lines = [];
  lines.push(`【${statusText}】${item.title || ''}`);
  if (item.platform) lines.push(`平台: ${item.platform}`);
  if (item.season || item.episode) {
    const eparts = [];
    if (item.season) eparts.push(`第${item.season}季`);
    if (item.episode) eparts.push(`第${item.episode}集`);
    lines.push(eparts.join(' '));
  }
  if (stars) lines.push(stars);
  if (item.review) lines.push(item.review);
  if (item.tags && item.tags.length) lines.push(`#${item.tags.join(' #')}`);
  return lines.join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = {
    STORAGE_KEYS, STATUS, STATUS_LABELS, DEFAULT_SETTINGS, DEFAULT_SITE_RULES,
    generateId, formatTime, formatDate, formatDateTime, getHostname, getPlatformName,
    getStorage, setStorage, getItems, saveItems, getItemById, addItem, updateItem,
    deleteItem, findItemByUrl, findOrCreateItem, getSettings, saveSettings,
    getSiteRules, saveSiteRules, getHistory, addHistory, clearHistory,
    exportData, importData, generateShareCard
  };
}

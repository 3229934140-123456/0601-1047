importScripts('../shared/storage.js');

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

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const existingSettings = await getStorage('tracker_settings', null);
    if (!existingSettings) {
      await saveSettings({
        reminderTime: '20:00',
        privacyMode: false,
        exportFormat: 'json',
        autoDetect: true,
        showOverlay: true,
        notificationEnabled: true
      });
    }
    const existingRules = await getStorage('tracker_site_rules', null);
    if (!existingRules) {
      await saveSiteRules(DEFAULT_SITE_RULES);
    }
    scheduleAllReminders();
  }
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAllReminders();
});

async function scheduleAllReminders() {
  const items = await getItems();
  const settings = await getSettings();

  const existingAlarms = await chrome.alarms.getAll();
  const alarmNames = new Set(existingAlarms.map(a => a.name));

  for (const item of items) {
    if (!item.reminders || !item.reminders.length) continue;
    for (const rem of item.reminders) {
      const alarmName = `reminder_${rem.id}`;
      if (rem.time > Date.now() && !alarmNames.has(alarmName)) {
        try {
          await chrome.alarms.create(alarmName, { when: rem.time });
        } catch (e) {
          console.warn('Failed to create alarm:', e);
        }
      }
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    const reminderId = alarm.name.replace('reminder_', '');
    const items = await getItems();

    for (const item of items) {
      const rem = (item.reminders || []).find(r => r.id === reminderId);
      if (rem) {
        const settings = await getSettings();
        if (settings.notificationEnabled !== false) {
          try {
            await chrome.notifications.create(`notif_${reminderId}`, {
              type: 'basic',
              iconUrl: '../assets/icon128.png',
              title: '📺 影视追踪提醒',
              message: `该看《${item.title}》了！${rem.note || ''}`,
              priority: 2
            });
          } catch (e) {
            console.warn('Failed to create notification:', e);
          }
        }
        break;
      }
    }
  }
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId.startsWith('notif_')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/library/library.html') });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(e => {
    console.error('Message handler error:', e);
    sendResponse({ success: false, error: e.message });
  });
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.action) {
    case 'findOrCreateItem':
      return await handleFindOrCreateItem(msg.videoInfo);

    case 'updateItem':
      return await handleUpdateItem(msg);

    case 'generateShareCard':
      return { card: generateShareCard(msg.item) };

    case 'getVideoInfo':
      return null;

    default:
      return { success: false, error: 'Unknown action' };
  }
}

async function handleFindOrCreateItem(videoInfo) {
  const item = await findOrCreateItem(videoInfo);
  return { success: true, item };
}

async function handleUpdateItem(msg) {
  const { id, updates, silent, createAlarm, alarmData } = msg;
  const updated = await updateItem(id, updates);

  if (createAlarm && alarmData) {
    try {
      await chrome.alarms.create(`reminder_${alarmData.id}`, { when: alarmData.time });
    } catch (e) {
      console.warn('Failed to create alarm:', e);
    }
  }

  if (!silent) {
    await addHistory({ type: 'update', itemId: id, itemTitle: updates.title || updated?.title });
  }

  return { success: true, item: updated };
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const settings = await getSettings();
    if (settings.autoDetect === false) return;
  }
});

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

/**
 * PrivacyShield for AI - バックグラウンドスクリプト
 *
 * サイドパネルの開閉制御、メッセージ中継、ストレージ管理を担当
 */

// 拡張機能の有効/無効状態
let isEnabled = true;

// サイドパネルの状態を管理
const sidePanelState = new Map();

/**
 * 拡張機能インストール時の初期設定
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 初期設定を保存
    await chrome.storage.sync.set({
      isEnabled: true,
      customPatterns: [],
      disabledPatterns: [],
      autoMask: true,
      showNotifications: true
    });

    console.log('PrivacyShield for AI がインストールされました');
  }
});

/**
 * サイドパネルの動作を設定
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error('サイドパネルの設定に失敗:', error);
});

/**
 * タブがアクティブになったときにサイドパネルを有効化
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updateSidePanelState(tab);
  } catch (error) {
    console.error('タブ情報の取得に失敗:', error);
  }
});

/**
 * タブのURLが変更されたときにサイドパネルの状態を更新
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await updateSidePanelState(tab);
  }
});

/**
 * サイドパネルの有効/無効状態を更新
 */
async function updateSidePanelState(tab) {
  if (!tab.url) return;

  const isClaudeAi = tab.url.includes('claude.ai');
  const isChatGPT = tab.url.includes('chat.openai.com');
  const isSupported = isClaudeAi || isChatGPT;

  try {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      enabled: isSupported
    });

    sidePanelState.set(tab.id, {
      enabled: isSupported,
      service: isClaudeAi ? 'claude' : isChatGPT ? 'chatgpt' : null
    });
  } catch (error) {
    console.error('サイドパネル設定の更新に失敗:', error);
  }
}

/**
 * メッセージハンドラー
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    console.error('メッセージ処理エラー:', error);
    sendResponse({ success: false, error: error.message });
  });
  return true; // 非同期レスポンスを有効化
});

/**
 * メッセージを処理
 */
async function handleMessage(message, sender) {
  switch (message.type) {
    case 'SIDEPANEL_READY':
      return { success: true, message: 'サイドパネル準備完了' };

    case 'GET_ENABLED_STATE':
      const { isEnabled } = await chrome.storage.sync.get('isEnabled');
      return { success: true, isEnabled };

    case 'SET_ENABLED_STATE':
      await chrome.storage.sync.set({ isEnabled: message.isEnabled });
      // 全タブのコンテンツスクリプトに通知
      await notifyAllTabs({ type: 'ENABLED_STATE_CHANGED', isEnabled: message.isEnabled });
      return { success: true };

    case 'GET_SETTINGS':
      const settings = await chrome.storage.sync.get([
        'isEnabled',
        'customPatterns',
        'disabledPatterns',
        'autoMask',
        'showNotifications'
      ]);
      return { success: true, settings };

    case 'SAVE_SETTINGS':
      await chrome.storage.sync.set(message.settings);
      // 設定変更を通知
      await notifySidePanel({ type: 'SETTINGS_UPDATED' });
      return { success: true };

    case 'TEXT_FROM_PAGE':
      // コンテンツスクリプトからテキストを受信し、サイドパネルに転送
      await notifySidePanel({ type: 'TEXT_FROM_PAGE', text: message.text });
      return { success: true };

    case 'REQUEST_MASKED_TEXT':
      // マスキング済みテキストを要求
      return await requestMaskedTextFromSidePanel();

    case 'OPEN_SIDEPANEL':
      // サイドパネルを開く
      if (sender.tab) {
        await chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      return { success: true };

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

/**
 * サイドパネルにメッセージを送信
 */
async function notifySidePanel(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    // サイドパネルが開いていない場合はエラーを無視
    console.log('サイドパネルへの通知をスキップ:', error.message);
  }
}

/**
 * サイドパネルからマスキング済みテキストを取得
 */
async function requestMaskedTextFromSidePanel() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'REQUEST_MASKED_TEXT' });
    return response;
  } catch (error) {
    return { success: false, error: 'サイドパネルが開いていません' };
  }
}

/**
 * 全タブのコンテンツスクリプトにメッセージを送信
 */
async function notifyAllTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://claude.ai/*', 'https://chat.openai.com/*'] });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (error) {
        // コンテンツスクリプトが読み込まれていないタブはスキップ
      }
    }
  } catch (error) {
    console.error('タブへの通知に失敗:', error);
  }
}

/**
 * コンテキストメニューを作成
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'privacyshield-mask-selection',
    title: 'PrivacyShieldでマスキング',
    contexts: ['selection'],
    documentUrlPatterns: ['https://claude.ai/*', 'https://chat.openai.com/*']
  });
});

/**
 * コンテキストメニューのクリックハンドラー
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'privacyshield-mask-selection' && info.selectionText) {
    // 選択テキストをサイドパネルに送信
    await notifySidePanel({ type: 'TEXT_FROM_PAGE', text: info.selectionText });

    // サイドパネルを開く
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.error('サイドパネルを開けませんでした:', error);
    }
  }
});

/**
 * 拡張機能アイコンのバッジを更新
 */
async function updateBadge(tabId, detectionCount) {
  if (detectionCount > 0) {
    await chrome.action.setBadgeText({ text: String(detectionCount), tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId });
  } else {
    await chrome.action.setBadgeText({ text: '', tabId });
  }
}

/**
 * タブが閉じられたときにステートをクリーンアップ
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  sidePanelState.delete(tabId);
});

console.log('PrivacyShield for AI バックグラウンドスクリプトが起動しました');

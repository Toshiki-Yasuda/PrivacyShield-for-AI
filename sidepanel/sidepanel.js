/**
 * PrivacyShield for AI - サイドパネル
 */

// DOM要素
const originalText = document.getElementById('originalText');
const maskedText = document.getElementById('maskedText');
const pasteBtn = document.getElementById('pasteBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const restoreBtn = document.getElementById('restoreBtn');
const settingsBtn = document.getElementById('settingsBtn');
const toast = document.getElementById('toast');

// 統計表示要素
const statElements = {
  name: document.getElementById('statName'),
  phone: document.getElementById('statPhone'),
  email: document.getElementById('statEmail'),
  address: document.getElementById('statAddress'),
  company: document.getElementById('statCompany')
};

// マスキングエンジンのインスタンス
const maskingEngine = new MaskingEngine();

// 現在のマッピングテーブル（復元用）
let currentMappingTable = new Map();

// デバウンス用タイマー
let debounceTimer = null;

/**
 * テキストをマスキングして表示
 */
function performMasking() {
  const text = originalText.value;

  if (!text.trim()) {
    maskedText.value = '';
    updateStats({});
    currentMappingTable = new Map();
    return;
  }

  const result = maskingEngine.mask(text);
  maskedText.value = result.maskedText;
  currentMappingTable = result.mappingTable;

  // 統計を更新
  const stats = maskingEngine.getStatistics(result.detections);
  updateStats(stats);

  // コンテンツスクリプトに通知
  notifyContentScript({
    type: 'MASKED_TEXT_UPDATED',
    maskedText: result.maskedText,
    detections: result.detections
  });
}

/**
 * 統計表示を更新
 */
function updateStats(stats) {
  const typeMapping = {
    name: 'name',
    phone: 'phone',
    email: 'email',
    address: 'address',
    company: 'company'
  };

  for (const [key, element] of Object.entries(statElements)) {
    const count = stats[key]?.count || 0;
    const countSpan = element.querySelector('.stat-count');
    countSpan.textContent = count;

    if (count > 0) {
      element.classList.add('has-detection');
    } else {
      element.classList.remove('has-detection');
    }
  }
}

/**
 * トースト通知を表示
 */
function showToast(message, type = 'default') {
  toast.textContent = message;
  toast.className = 'toast';
  if (type !== 'default') {
    toast.classList.add(type);
  }
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

/**
 * コンテンツスクリプトにメッセージを送信
 */
async function notifyContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // タブがClaude.aiでない場合はエラーを無視
      });
    }
  } catch (error) {
    console.log('コンテンツスクリプトへの通知をスキップ:', error);
  }
}

/**
 * クリップボードから貼り付け
 */
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    originalText.value = text;
    performMasking();
    showToast('貼り付けました', 'success');
  } catch (error) {
    showToast('クリップボードの読み取りに失敗しました', 'error');
  }
}

/**
 * マスキング済みテキストをコピー
 */
async function copyMaskedText() {
  const text = maskedText.value;
  if (!text.trim()) {
    showToast('コピーするテキストがありません', 'warning');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('コピーしました', 'success');
  } catch (error) {
    showToast('コピーに失敗しました', 'error');
  }
}

/**
 * テキストをクリア
 */
function clearText() {
  originalText.value = '';
  maskedText.value = '';
  currentMappingTable = new Map();
  updateStats({});
  showToast('クリアしました', 'success');
}

/**
 * マスキングテキストを復元
 */
function restoreText() {
  if (currentMappingTable.size === 0) {
    showToast('復元するデータがありません', 'warning');
    return;
  }

  const restored = maskingEngine.restore(maskedText.value, currentMappingTable);
  maskedText.value = restored;
  showToast('復元しました', 'success');
}

/**
 * 設定画面を開く
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * バックグラウンドからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'TEXT_FROM_PAGE':
      // ページからテキストを受信
      originalText.value = message.text;
      performMasking();
      sendResponse({ success: true });
      break;

    case 'REQUEST_MASKED_TEXT':
      // マスキング済みテキストの要求
      sendResponse({
        success: true,
        maskedText: maskedText.value,
        mappingTable: Object.fromEntries(currentMappingTable)
      });
      break;

    case 'SETTINGS_UPDATED':
      // 設定が更新された
      loadCustomPatterns();
      performMasking();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  return true;
});

/**
 * カスタムパターンを読み込む
 */
async function loadCustomPatterns() {
  try {
    const { customPatterns = [], disabledPatterns = [] } = await chrome.storage.sync.get([
      'customPatterns',
      'disabledPatterns'
    ]);

    // 無効化されたパターンを除外
    for (const patternKey of disabledPatterns) {
      maskingEngine.removePattern(patternKey);
    }

    // カスタムパターンを追加
    for (const pattern of customPatterns) {
      try {
        const regex = new RegExp(pattern.regex, 'g');
        maskingEngine.addCustomPattern(pattern.key, regex, pattern.label, pattern.description);
      } catch (e) {
        console.error('Invalid custom pattern:', pattern, e);
      }
    }
  } catch (error) {
    console.error('Failed to load custom patterns:', error);
  }
}

/**
 * 初期化
 */
async function init() {
  // カスタムパターンを読み込む
  await loadCustomPatterns();

  // イベントリスナーを設定
  originalText.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performMasking, 300);
  });

  maskedText.addEventListener('input', () => {
    // 手動編集時はマッピングテーブルをクリアしない
    // ユーザーが直接編集できるようにする
  });

  pasteBtn.addEventListener('click', pasteFromClipboard);
  copyBtn.addEventListener('click', copyMaskedText);
  clearBtn.addEventListener('click', clearText);
  restoreBtn.addEventListener('click', restoreText);
  settingsBtn.addEventListener('click', openSettings);

  // バックグラウンドに準備完了を通知
  chrome.runtime.sendMessage({ type: 'SIDEPANEL_READY' }).catch(() => {});
}

// DOMContentLoadedで初期化
document.addEventListener('DOMContentLoaded', init);

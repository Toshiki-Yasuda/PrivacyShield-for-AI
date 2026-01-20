/**
 * PrivacyShield for AI - サイドパネル
 */

// DOM要素
const originalText = document.getElementById('originalText');
const maskedText = document.getElementById('maskedText');
const pasteBtn = document.getElementById('pasteBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const decryptBtn = document.getElementById('decryptBtn');
const settingsBtn = document.getElementById('settingsBtn');
const toast = document.getElementById('toast');

// 新しいDOM要素
const darkModeBtn = document.getElementById('darkModeBtn');
const fontSizeUp = document.getElementById('fontSizeUp');
const fontSizeDown = document.getElementById('fontSizeDown');
const fontSizeLabel = document.getElementById('fontSizeLabel');

// マッピング管理DOM要素
const mappingBar = document.getElementById('mappingBar');
const mappingStatus = document.getElementById('mappingStatus');
const mappingSelect = document.getElementById('mappingSelect');
const saveMappingBtn = document.getElementById('saveMappingBtn');
const deleteMappingBtn = document.getElementById('deleteMappingBtn');

// 現在のマッピング名（保存済みの場合）
let currentMappingName = null;

// 文字サイズ設定
const fontSizes = ['small', 'medium', 'large', 'xlarge'];
const fontSizeLabels = { small: '小', medium: '中', large: '大', xlarge: '特大' };
let currentFontSizeIndex = 1; // デフォルトはmedium

// ダークモード状態
let isDarkMode = false;

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
    currentMappingName = null;
    updateMappingStatus();
    return;
  }

  const result = maskingEngine.mask(text);
  maskedText.value = result.maskedText;
  currentMappingTable = result.mappingTable;
  currentMappingName = null; // 新規マスキングなので名前をリセット
  updateMappingStatus();

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
 * マッピング状態表示を更新
 */
function updateMappingStatus() {
  const count = currentMappingTable.size;
  const statusIcon = mappingStatus.querySelector('.status-icon');
  const statusText = mappingStatus.querySelector('.status-text');

  if (count > 0) {
    mappingBar.classList.add('active');
    statusIcon.textContent = '🔐';
    if (currentMappingName) {
      statusText.textContent = `${currentMappingName} (${count}件)`;
    } else {
      statusText.textContent = `対応表あり (${count}件)`;
    }
  } else {
    mappingBar.classList.remove('active');
    statusIcon.textContent = '🔓';
    statusText.textContent = '対応表なし';
    currentMappingName = null;
  }
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
  currentMappingName = null;
  updateStats({});
  updateMappingStatus();
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
 * AIの返答を復号化（クリップボードから貼り付けて復元）
 */
async function decryptAIResponse() {
  if (currentMappingTable.size === 0) {
    showToast('対応表がありません。先にマスキングを行うか、保存済みの対応表を選択してください', 'warning');
    return;
  }

  try {
    // クリップボードからテキストを取得
    const clipboardText = await navigator.clipboard.readText();

    if (!clipboardText.trim()) {
      showToast('クリップボードが空です', 'warning');
      return;
    }

    // マスキング後エリアに貼り付け
    maskedText.value = clipboardText;

    // 復号化を実行
    const restored = maskingEngine.restore(clipboardText, currentMappingTable);
    maskedText.value = restored;

    showToast('AIの返答を復号化しました', 'success');
  } catch (error) {
    showToast('クリップボードの読み取りに失敗しました', 'error');
  }
}

/**
 * マッピングを保存
 */
async function saveMapping() {
  if (currentMappingTable.size === 0) {
    showToast('保存する対応表がありません', 'warning');
    return;
  }

  try {
    // 保存済みマッピング一覧を取得
    const { savedMappings = [] } = await chrome.storage.local.get('savedMappings');

    // 新しいマッピングを作成
    const timestamp = new Date();
    const name = timestamp.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const newMapping = {
      id: Date.now().toString(),
      name: name,
      createdAt: timestamp.toISOString(),
      mappingTable: Object.fromEntries(currentMappingTable),
      itemCount: currentMappingTable.size
    };

    // 最大10件まで保存（古いものを削除）
    const updatedMappings = [newMapping, ...savedMappings].slice(0, 10);

    await chrome.storage.local.set({ savedMappings: updatedMappings });

    // ドロップダウンを更新
    await loadSavedMappings();

    // 保存したマッピングを選択状態に
    mappingSelect.value = newMapping.id;
    currentMappingName = newMapping.name;
    updateMappingStatus();

    showToast(`対応表を保存しました（${currentMappingTable.size}件）`, 'success');
  } catch (error) {
    console.error('マッピング保存エラー:', error);
    showToast('保存に失敗しました', 'error');
  }
}

/**
 * 保存済みマッピング一覧を読み込む
 */
async function loadSavedMappings() {
  try {
    const { savedMappings = [] } = await chrome.storage.local.get('savedMappings');

    // ドロップダウンをクリア（最初のオプション以外）
    while (mappingSelect.options.length > 1) {
      mappingSelect.remove(1);
    }

    // 保存済みマッピングを追加
    for (const mapping of savedMappings) {
      const option = document.createElement('option');
      option.value = mapping.id;
      option.textContent = `${mapping.name} (${mapping.itemCount}件)`;
      mappingSelect.appendChild(option);
    }
  } catch (error) {
    console.error('マッピング読み込みエラー:', error);
  }
}

/**
 * マッピングを選択して適用
 */
async function selectMapping() {
  const selectedId = mappingSelect.value;

  if (!selectedId) {
    // 選択解除の場合は現在のマッピングをクリアしない
    return;
  }

  try {
    const { savedMappings = [] } = await chrome.storage.local.get('savedMappings');
    const mapping = savedMappings.find(m => m.id === selectedId);

    if (mapping) {
      // マッピングテーブルを復元
      currentMappingTable = new Map(Object.entries(mapping.mappingTable));
      currentMappingName = mapping.name;
      updateMappingStatus();
      showToast(`対応表を読み込みました（${currentMappingTable.size}件）`, 'success');
    }
  } catch (error) {
    console.error('マッピング選択エラー:', error);
    showToast('読み込みに失敗しました', 'error');
  }
}

/**
 * 選択したマッピングを削除
 */
async function deleteMapping() {
  const selectedId = mappingSelect.value;

  if (!selectedId) {
    showToast('削除する対応表を選択してください', 'warning');
    return;
  }

  try {
    const { savedMappings = [] } = await chrome.storage.local.get('savedMappings');
    const updatedMappings = savedMappings.filter(m => m.id !== selectedId);

    await chrome.storage.local.set({ savedMappings: updatedMappings });

    // ドロップダウンを更新
    await loadSavedMappings();
    mappingSelect.value = '';

    showToast('対応表を削除しました', 'success');
  } catch (error) {
    console.error('マッピング削除エラー:', error);
    showToast('削除に失敗しました', 'error');
  }
}

/**
 * 設定画面を開く
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * ダークモードを切り替え
 */
function toggleDarkMode() {
  isDarkMode = !isDarkMode;
  applyDarkMode();
  savePanelSettings();
}

/**
 * ダークモードを適用
 */
function applyDarkMode() {
  if (isDarkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    darkModeBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    `;
  } else {
    document.documentElement.removeAttribute('data-theme');
    darkModeBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    `;
  }
}

/**
 * 文字サイズを大きく
 */
function increaseFontSize() {
  if (currentFontSizeIndex < fontSizes.length - 1) {
    currentFontSizeIndex++;
    applyFontSize();
    savePanelSettings();
  }
}

/**
 * 文字サイズを小さく
 */
function decreaseFontSize() {
  if (currentFontSizeIndex > 0) {
    currentFontSizeIndex--;
    applyFontSize();
    savePanelSettings();
  }
}

/**
 * 文字サイズを適用
 */
function applyFontSize() {
  const size = fontSizes[currentFontSizeIndex];
  document.documentElement.setAttribute('data-font-size', size);
  fontSizeLabel.textContent = fontSizeLabels[size];
}

/**
 * パネル設定を保存
 */
async function savePanelSettings() {
  try {
    await chrome.storage.sync.set({
      panelDarkMode: isDarkMode,
      panelFontSize: currentFontSizeIndex
    });
  } catch (error) {
    console.error('設定の保存に失敗:', error);
  }
}

/**
 * パネル設定を読み込み
 */
async function loadPanelSettings() {
  try {
    const { panelDarkMode = false, panelFontSize = 1 } = await chrome.storage.sync.get([
      'panelDarkMode',
      'panelFontSize'
    ]);
    isDarkMode = panelDarkMode;
    currentFontSizeIndex = panelFontSize;
    applyDarkMode();
    applyFontSize();
  } catch (error) {
    console.error('設定の読み込みに失敗:', error);
  }
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
  // パネル設定を読み込む（ダークモード・文字サイズ）
  await loadPanelSettings();

  // カスタムパターンを読み込む
  await loadCustomPatterns();

  // 保存済みマッピングを読み込む
  await loadSavedMappings();

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
  decryptBtn.addEventListener('click', decryptAIResponse);
  settingsBtn.addEventListener('click', openSettings);

  // マッピング管理のイベントリスナー
  saveMappingBtn.addEventListener('click', saveMapping);
  deleteMappingBtn.addEventListener('click', deleteMapping);
  mappingSelect.addEventListener('change', selectMapping);

  // ダークモード・文字サイズのイベントリスナー
  darkModeBtn.addEventListener('click', toggleDarkMode);
  fontSizeUp.addEventListener('click', increaseFontSize);
  fontSizeDown.addEventListener('click', decreaseFontSize);

  // バックグラウンドに準備完了を通知
  chrome.runtime.sendMessage({ type: 'SIDEPANEL_READY' }).catch(() => {});
}

// DOMContentLoadedで初期化
document.addEventListener('DOMContentLoaded', init);

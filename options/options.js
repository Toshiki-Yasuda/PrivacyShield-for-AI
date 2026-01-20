/**
 * PrivacyShield for AI - 設定画面
 */

// DOM要素
const defaultPatterns = document.getElementById('defaultPatterns');
const customPatterns = document.getElementById('customPatterns');
const emptyState = document.getElementById('emptyState');
const addPatternBtn = document.getElementById('addPatternBtn');
const autoMask = document.getElementById('autoMask');
const showNotifications = document.getElementById('showNotifications');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const resetBtn = document.getElementById('resetBtn');
const saveBtn = document.getElementById('saveBtn');
const saveStatus = document.getElementById('saveStatus');
const closePageBtn = document.getElementById('closePageBtn');

// モーダル要素
const patternModal = document.getElementById('patternModal');
const modalTitle = document.getElementById('modalTitle');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const savePatternBtn = document.getElementById('savePatternBtn');
const patternKey = document.getElementById('patternKey');
const patternLabel = document.getElementById('patternLabel');
const patternRegex = document.getElementById('patternRegex');
const patternDescription = document.getElementById('patternDescription');
const patternTest = document.getElementById('patternTest');
const testResult = document.getElementById('testResult');

// 現在の設定
let currentSettings = {
  disabledPatterns: [],
  customPatterns: [],
  autoMask: true,
  showNotifications: true
};

// 編集中のカスタムパターンのインデックス（-1は新規追加）
let editingPatternIndex = -1;

/**
 * 設定を読み込む
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'disabledPatterns',
      'customPatterns',
      'autoMask',
      'showNotifications'
    ]);

    currentSettings = {
      disabledPatterns: settings.disabledPatterns || [],
      customPatterns: settings.customPatterns || [],
      autoMask: settings.autoMask !== false,
      showNotifications: settings.showNotifications !== false
    };

    renderDefaultPatterns();
    renderCustomPatterns();
    renderOtherSettings();
  } catch (error) {
    console.error('設定の読み込みに失敗:', error);
  }
}

/**
 * デフォルトパターンを描画
 */
function renderDefaultPatterns() {
  const checkboxes = defaultPatterns.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((checkbox) => {
    const isDisabled = currentSettings.disabledPatterns.includes(checkbox.value);
    checkbox.checked = !isDisabled;
  });
}

/**
 * カスタムパターンを描画
 */
function renderCustomPatterns() {
  if (currentSettings.customPatterns.length === 0) {
    customPatterns.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  customPatterns.innerHTML = currentSettings.customPatterns
    .map(
      (pattern, index) => `
    <div class="custom-pattern-item" data-index="${index}">
      <div class="pattern-info">
        <span class="pattern-name">${escapeHtml(pattern.label)}</span>
        <span class="pattern-description">${escapeHtml(pattern.description)}</span>
        <span class="pattern-regex">/${escapeHtml(pattern.regex)}/</span>
      </div>
      <div class="custom-pattern-actions">
        <button class="edit-btn" title="編集" data-index="${index}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="delete-btn" title="削除" data-index="${index}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `
    )
    .join('');

  // イベントリスナーを設定
  customPatterns.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => editPattern(parseInt(btn.dataset.index)));
  });
  customPatterns.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deletePattern(parseInt(btn.dataset.index)));
  });
}

/**
 * その他の設定を描画
 */
function renderOtherSettings() {
  autoMask.checked = currentSettings.autoMask;
  showNotifications.checked = currentSettings.showNotifications;
}

/**
 * 設定を保存
 */
async function saveSettings() {
  try {
    // デフォルトパターンの無効化リストを取得
    const checkboxes = defaultPatterns.querySelectorAll('input[type="checkbox"]');
    const disabledPatterns = [];
    checkboxes.forEach((checkbox) => {
      if (!checkbox.checked) {
        disabledPatterns.push(checkbox.value);
      }
    });

    currentSettings.disabledPatterns = disabledPatterns;
    currentSettings.autoMask = autoMask.checked;
    currentSettings.showNotifications = showNotifications.checked;

    await chrome.storage.sync.set(currentSettings);

    // バックグラウンドに通知
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: currentSettings
    });

    showSaveStatus('保存しました');
  } catch (error) {
    console.error('設定の保存に失敗:', error);
    showSaveStatus('保存に失敗しました', true);
  }
}

/**
 * 保存ステータスを表示
 */
function showSaveStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.style.color = isError ? 'var(--error-color)' : 'var(--success-color)';

  setTimeout(() => {
    saveStatus.textContent = '';
  }, 3000);
}

/**
 * モーダルを開く
 */
function openModal(isEdit = false, index = -1) {
  editingPatternIndex = index;
  modalTitle.textContent = isEdit ? 'カスタムパターンを編集' : 'カスタムパターンを追加';

  if (isEdit && index >= 0) {
    const pattern = currentSettings.customPatterns[index];
    patternKey.value = pattern.key;
    patternLabel.value = pattern.label;
    patternRegex.value = pattern.regex;
    patternDescription.value = pattern.description;
  } else {
    patternKey.value = '';
    patternLabel.value = '';
    patternRegex.value = '';
    patternDescription.value = '';
  }

  patternTest.value = '';
  testResult.textContent = '';
  testResult.className = 'test-result';

  patternModal.classList.add('show');
}

/**
 * モーダルを閉じる
 */
function closeModal() {
  patternModal.classList.remove('show');
  editingPatternIndex = -1;
}

/**
 * パターンを編集
 */
function editPattern(index) {
  openModal(true, index);
}

/**
 * パターンを削除
 */
function deletePattern(index) {
  if (!confirm('このカスタムパターンを削除しますか？')) return;

  currentSettings.customPatterns.splice(index, 1);
  renderCustomPatterns();
}

/**
 * パターンを保存
 */
function savePattern() {
  const key = patternKey.value.trim();
  const label = patternLabel.value.trim();
  const regex = patternRegex.value.trim();
  const description = patternDescription.value.trim();

  // バリデーション
  if (!key || !label || !regex) {
    alert('パターン名、ラベル、正規表現は必須です');
    return;
  }

  // 正規表現の妥当性をチェック
  try {
    new RegExp(regex);
  } catch (e) {
    alert('正規表現が無効です: ' + e.message);
    return;
  }

  // キーの重複チェック（編集時は自身を除外）
  const isDuplicate = currentSettings.customPatterns.some(
    (p, i) => p.key === key && i !== editingPatternIndex
  );
  if (isDuplicate) {
    alert('同じパターン名が既に存在します');
    return;
  }

  const pattern = { key, label, regex, description };

  if (editingPatternIndex >= 0) {
    currentSettings.customPatterns[editingPatternIndex] = pattern;
  } else {
    currentSettings.customPatterns.push(pattern);
  }

  renderCustomPatterns();
  closeModal();
}

/**
 * パターンをテスト
 */
function testPattern() {
  const regex = patternRegex.value.trim();
  const testText = patternTest.value.trim();

  if (!regex || !testText) {
    testResult.textContent = '';
    testResult.className = 'test-result';
    return;
  }

  try {
    const re = new RegExp(regex, 'g');
    const matches = testText.match(re);

    if (matches && matches.length > 0) {
      testResult.textContent = `✓ ${matches.length}件マッチ: ${matches.join(', ')}`;
      testResult.className = 'test-result success';
    } else {
      testResult.textContent = '✗ マッチなし';
      testResult.className = 'test-result error';
    }
  } catch (e) {
    testResult.textContent = '✗ 正規表現エラー: ' + e.message;
    testResult.className = 'test-result error';
  }
}

/**
 * 設定をエクスポート
 */
async function exportSettings() {
  const data = JSON.stringify(currentSettings, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'privacyshield-settings.json';
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * 設定をインポート
 */
function importSettings() {
  importInput.click();
}

/**
 * インポートファイルを処理
 */
async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = JSON.parse(text);

    // バリデーション
    if (typeof imported !== 'object') {
      throw new Error('無効な設定ファイルです');
    }

    // 設定をマージ
    if (Array.isArray(imported.disabledPatterns)) {
      currentSettings.disabledPatterns = imported.disabledPatterns;
    }
    if (Array.isArray(imported.customPatterns)) {
      currentSettings.customPatterns = imported.customPatterns;
    }
    if (typeof imported.autoMask === 'boolean') {
      currentSettings.autoMask = imported.autoMask;
    }
    if (typeof imported.showNotifications === 'boolean') {
      currentSettings.showNotifications = imported.showNotifications;
    }

    renderDefaultPatterns();
    renderCustomPatterns();
    renderOtherSettings();

    showSaveStatus('インポートしました（保存ボタンで確定）');
  } catch (error) {
    alert('インポートに失敗しました: ' + error.message);
  }

  // 入力をリセット
  importInput.value = '';
}

/**
 * 設定をリセット
 */
async function resetSettings() {
  if (!confirm('すべての設定を初期状態に戻しますか？')) return;

  currentSettings = {
    disabledPatterns: [],
    customPatterns: [],
    autoMask: true,
    showNotifications: true
  };

  renderDefaultPatterns();
  renderCustomPatterns();
  renderOtherSettings();

  showSaveStatus('リセットしました（保存ボタンで確定）');
}

/**
 * ページを閉じる
 */
async function closePage() {
  try {
    // Chrome拡張機能APIでタブを閉じる
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
    }
  } catch (error) {
    // フォールバック: window.closeを試行
    window.close();
  }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 初期化
 */
function init() {
  // 設定を読み込む
  loadSettings();

  // イベントリスナーを設定
  addPatternBtn.addEventListener('click', () => openModal(false));
  closeModalBtn.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);
  savePatternBtn.addEventListener('click', savePattern);
  patternRegex.addEventListener('input', testPattern);
  patternTest.addEventListener('input', testPattern);
  exportBtn.addEventListener('click', exportSettings);
  importBtn.addEventListener('click', importSettings);
  importInput.addEventListener('change', handleImport);
  resetBtn.addEventListener('click', resetSettings);
  saveBtn.addEventListener('click', saveSettings);
  closePageBtn.addEventListener('click', closePage);

  // モーダル外クリックで閉じる
  patternModal.addEventListener('click', (e) => {
    if (e.target === patternModal) {
      closeModal();
    }
  });
}

// DOMContentLoadedで初期化
document.addEventListener('DOMContentLoaded', init);

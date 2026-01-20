/**
 * PrivacyShield for AI - ポップアップ
 */

// DOM要素
const enableToggle = document.getElementById('enableToggle');
const statusText = document.getElementById('statusText');
const pageStatus = document.getElementById('pageStatus');
const openSidePanelBtn = document.getElementById('openSidePanelBtn');
const settingsBtn = document.getElementById('settingsBtn');
const todayCount = document.getElementById('todayCount');
const protectedCount = document.getElementById('protectedCount');

/**
 * 有効/無効状態を更新
 */
async function updateEnabledState(enabled) {
  try {
    await chrome.runtime.sendMessage({
      type: 'SET_ENABLED_STATE',
      isEnabled: enabled
    });

    updateStatusDisplay(enabled);
  } catch (error) {
    console.error('状態の更新に失敗:', error);
  }
}

/**
 * 状態表示を更新
 */
function updateStatusDisplay(enabled) {
  enableToggle.checked = enabled;
  statusText.textContent = enabled ? '有効' : '無効';
  statusText.className = 'status-text ' + (enabled ? 'active' : 'inactive');
}

/**
 * 現在のページの状態を確認
 */
async function checkPageStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url) {
      setPageStatusUnsupported('ページ情報を取得できません');
      return;
    }

    const isClaudeAi = tab.url.includes('claude.ai');
    const isChatGPT = tab.url.includes('chat.openai.com');

    if (isClaudeAi) {
      setPageStatusSupported('Claude.aiで利用可能');
    } else if (isChatGPT) {
      setPageStatusSupported('ChatGPTで利用可能');
    } else {
      setPageStatusUnsupported('このページでは利用できません');
    }
  } catch (error) {
    setPageStatusUnsupported('ページ情報を取得できません');
  }
}

/**
 * サポートされているページの状態を表示
 */
function setPageStatusSupported(message) {
  pageStatus.innerHTML = `
    <div class="status-icon supported">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    </div>
    <span class="status-message">${message}</span>
  `;
}

/**
 * サポートされていないページの状態を表示
 */
function setPageStatusUnsupported(message) {
  pageStatus.innerHTML = `
    <div class="status-icon unsupported">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
    </div>
    <span class="status-message">${message}</span>
  `;

  // サイドパネルボタンを無効化
  openSidePanelBtn.disabled = true;
  openSidePanelBtn.style.opacity = '0.5';
  openSidePanelBtn.style.cursor = 'not-allowed';
}

/**
 * サイドパネルを開く
 */
async function openSidePanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      // windowIdを使用してサイドパネルを開く
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    }
  } catch (error) {
    console.error('サイドパネルを開けませんでした:', error);
    // フォールバック: アラートで通知
    alert('サイドパネルを開けませんでした。\nブラウザ右上のサイドパネルアイコンから開いてください。');
  }
}

/**
 * 設定画面を開く
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}

/**
 * 統計を読み込む
 */
async function loadStats() {
  try {
    const { stats = {} } = await chrome.storage.local.get('stats');

    // 今日の日付を取得
    const today = new Date().toISOString().split('T')[0];

    // 今日のマスキング数
    const todayStats = stats[today] || { maskingCount: 0, protectedItems: 0 };
    todayCount.textContent = todayStats.maskingCount;
    protectedCount.textContent = `${todayStats.protectedItems} 件`;
  } catch (error) {
    console.error('統計の読み込みに失敗:', error);
  }
}

/**
 * 初期化
 */
async function init() {
  // 有効/無効状態を読み込む
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ENABLED_STATE' });
    if (response?.success) {
      updateStatusDisplay(response.isEnabled);
    }
  } catch (error) {
    console.error('状態の読み込みに失敗:', error);
  }

  // ページの状態を確認
  await checkPageStatus();

  // 統計を読み込む
  await loadStats();

  // イベントリスナーを設定
  enableToggle.addEventListener('change', (e) => {
    updateEnabledState(e.target.checked);
  });

  openSidePanelBtn.addEventListener('click', openSidePanel);
  settingsBtn.addEventListener('click', openSettings);
}

// DOMContentLoadedで初期化
document.addEventListener('DOMContentLoaded', init);

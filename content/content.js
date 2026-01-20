/**
 * PrivacyShield for AI - コンテンツスクリプト
 *
 * Claude.aiのテキスト入力を監視し、サイドパネルとの通信を行う
 */

(function () {
  'use strict';

  // 拡張機能の有効/無効状態
  let isEnabled = true;

  // 監視中の入力要素
  let observedInputs = new Set();

  // MutationObserver
  let observer = null;

  // 最後に検知した入力値（重複送信防止）
  let lastInputValue = '';

  /**
   * Claude.aiの入力欄セレクター
   */
  const CLAUDE_INPUT_SELECTORS = [
    '[data-placeholder="Reply to Claude…"]',
    '[contenteditable="true"]',
    'div.ProseMirror',
    'textarea'
  ];

  /**
   * 入力欄を検索
   */
  function findInputElements() {
    const inputs = [];
    for (const selector of CLAUDE_INPUT_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        if (el && !observedInputs.has(el)) {
          inputs.push(el);
        }
      });
    }
    return inputs;
  }

  /**
   * 入力欄のテキストを取得
   */
  function getInputText(element) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      return element.value;
    }
    return element.textContent || element.innerText || '';
  }

  /**
   * 入力欄にテキストを設定
   */
  function setInputText(element, text) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditableの場合
      element.textContent = text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    }
  }

  /**
   * 入力イベントハンドラー
   */
  function handleInput(event) {
    if (!isEnabled) return;

    const element = event.target;
    const text = getInputText(element);

    // 空または前回と同じ場合はスキップ
    if (!text.trim() || text === lastInputValue) return;

    lastInputValue = text;

    // バックグラウンドにテキストを送信
    chrome.runtime.sendMessage({
      type: 'TEXT_FROM_PAGE',
      text: text
    }).catch(() => {
      // バックグラウンドスクリプトが応答しない場合はスキップ
    });
  }

  /**
   * 入力欄を監視開始
   */
  function observeInput(element) {
    if (observedInputs.has(element)) return;

    observedInputs.add(element);
    element.addEventListener('input', handleInput);
    element.addEventListener('paste', handleInput);

    // PrivacyShield用のインジケーターを追加
    addProtectionIndicator(element);
  }

  /**
   * 保護インジケーターを追加
   */
  function addProtectionIndicator(element) {
    // 既にインジケーターがある場合はスキップ
    if (element.parentElement?.querySelector('.privacyshield-indicator')) return;

    const indicator = document.createElement('div');
    indicator.className = 'privacyshield-indicator';
    indicator.innerHTML = `
      <span class="privacyshield-badge" title="PrivacyShield有効">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </span>
    `;
    indicator.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 1000;
      opacity: ${isEnabled ? '1' : '0.5'};
    `;

    // 親要素がrelativeでない場合は設定
    const parent = element.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    parent?.appendChild(indicator);
  }

  /**
   * DOM変更を監視
   */
  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      // 新しい入力欄を探す
      const newInputs = findInputElements();
      newInputs.forEach(observeInput);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初期スキャン
    const inputs = findInputElements();
    inputs.forEach(observeInput);
  }

  /**
   * 監視を停止
   */
  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // イベントリスナーを削除
    observedInputs.forEach((element) => {
      element.removeEventListener('input', handleInput);
      element.removeEventListener('paste', handleInput);
    });
    observedInputs.clear();

    // インジケーターを削除
    document.querySelectorAll('.privacyshield-indicator').forEach((el) => el.remove());
  }

  /**
   * バックグラウンドからのメッセージを処理
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'ENABLED_STATE_CHANGED':
        isEnabled = message.isEnabled;
        updateIndicators();
        sendResponse({ success: true });
        break;

      case 'MASKED_TEXT_UPDATED':
        // マスキング済みテキストを受信（将来の自動挿入機能用）
        sendResponse({ success: true });
        break;

      case 'INSERT_MASKED_TEXT':
        // マスキング済みテキストを入力欄に挿入
        insertMaskedText(message.maskedText);
        sendResponse({ success: true });
        break;

      case 'GET_SELECTED_TEXT':
        // 選択中のテキストを取得
        const selection = window.getSelection()?.toString() || '';
        sendResponse({ success: true, text: selection });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
    return true;
  });

  /**
   * マスキング済みテキストを入力欄に挿入
   */
  function insertMaskedText(text) {
    // フォーカスされている入力欄、または最初に見つかった入力欄に挿入
    const activeElement = document.activeElement;
    const isInputElement = CLAUDE_INPUT_SELECTORS.some(
      (selector) => activeElement?.matches?.(selector)
    );

    if (isInputElement) {
      setInputText(activeElement, text);
    } else {
      // 最初の入力欄を探して挿入
      for (const selector of CLAUDE_INPUT_SELECTORS) {
        const element = document.querySelector(selector);
        if (element) {
          setInputText(element, text);
          element.focus();
          break;
        }
      }
    }
  }

  /**
   * インジケーターの表示を更新
   */
  function updateIndicators() {
    document.querySelectorAll('.privacyshield-indicator').forEach((indicator) => {
      indicator.style.opacity = isEnabled ? '1' : '0.5';
    });
  }

  /**
   * 初期化
   */
  async function init() {
    // 有効/無効状態を取得
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ENABLED_STATE' });
      if (response?.success) {
        isEnabled = response.isEnabled;
      }
    } catch (error) {
      // バックグラウンドが応答しない場合はデフォルトで有効
    }

    // 監視を開始
    startObserver();

    console.log('PrivacyShield for AI コンテンツスクリプトが起動しました');
  }

  // ページ読み込み完了後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

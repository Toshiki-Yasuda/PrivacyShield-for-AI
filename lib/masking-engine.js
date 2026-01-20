/**
 * PrivacyShield for AI - Masking Engine
 * 
 * 個人情報を検知してマスキングするコアエンジン
 * 完全にローカルで動作し、外部への情報送信は一切行わない
 */

class MaskingEngine {
  constructor() {
    // マスキングパターンの定義
    this.patterns = {
      // 日本語の氏名（姓名）
      name: {
        regex: /[一-龯々]{2,4}(?:\s+)?[一-龯々]{2,4}(?:さん|様|氏|殿|くん|ちゃん)?/g,
        label: 'Person',
        description: '氏名'
      },
      
      // メールアドレス
      email: {
        regex: /[\w\.-]+@[\w\.-]+\.\w+/g,
        label: 'Email',
        description: 'メールアドレス'
      },
      
      // 電話番号（日本）
      phone: {
        regex: /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{4}/g,
        label: 'Phone',
        description: '電話番号'
      },
      
      // 住所（都道府県から始まる）
      address: {
        regex: /(東京都|北海道|(?:京都|大阪)府|.{2,3}県)[\s　]*[^\s、。,\.]{2,}/g,
        label: 'Location',
        description: '住所'
      },
      
      // 企業名・組織名
      company: {
        regex: /(?:株式会社|有限会社|合同会社|一般社団法人|公益財団法人)[\s　]*[^\s、。,\.]{2,}|[^\s、。,\.]{2,}(?:株式会社|有限会社|合同会社)/g,
        label: 'Company',
        description: '企業名'
      }
    };

    // マスキング結果を保存（復元用）
    this.mappingTable = new Map();
    this.counter = {};
  }

  /**
   * テキストをマスキング
   * @param {string} text - 元のテキスト
   * @param {Array<string>} enabledPatterns - 有効にするパターン（デフォルト: 全て）
   * @return {Object} { maskedText, detections, mappingTable }
   */
  mask(text, enabledPatterns = null) {
    if (!text) return { maskedText: '', detections: [], mappingTable: new Map() };

    // カウンターとマッピングテーブルをリセット
    this.counter = {};
    this.mappingTable = new Map();
    
    let maskedText = text;
    const detections = [];

    // 使用するパターンを決定
    const patternsToUse = enabledPatterns 
      ? Object.entries(this.patterns).filter(([key]) => enabledPatterns.includes(key))
      : Object.entries(this.patterns);

    // 各パターンでマッチング
    for (const [patternKey, patternConfig] of patternsToUse) {
      const matches = [...maskedText.matchAll(patternConfig.regex)];
      
      if (matches.length === 0) continue;

      // カウンター初期化
      if (!this.counter[patternKey]) {
        this.counter[patternKey] = 0;
      }

      // 各マッチを処理（後ろから処理して位置がずれないようにする）
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const originalText = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + originalText.length;

        // マスク済みの場合はスキップ
        if (originalText.startsWith('[') && originalText.endsWith(']')) {
          continue;
        }

        // マスキング用のラベルを生成
        this.counter[patternKey]++;
        const maskLabel = `[${patternConfig.label}_${String.fromCharCode(64 + this.counter[patternKey])}]`;

        // マッピングテーブルに保存
        this.mappingTable.set(maskLabel, originalText);

        // テキストを置換
        maskedText = maskedText.slice(0, startIndex) + maskLabel + maskedText.slice(endIndex);

        // 検知情報を記録
        detections.push({
          type: patternKey,
          description: patternConfig.description,
          original: originalText,
          masked: maskLabel,
          startIndex,
          endIndex
        });
      }
    }

    return {
      maskedText,
      detections: detections.reverse(), // 元の順序に戻す
      mappingTable: new Map(this.mappingTable)
    };
  }

  /**
   * マスキングされたテキストを復元
   * @param {string} maskedText - マスキング済みテキスト
   * @param {Map} mappingTable - マッピングテーブル
   * @return {string} 復元されたテキスト
   */
  restore(maskedText, mappingTable) {
    if (!maskedText || !mappingTable) return maskedText;

    let restoredText = maskedText;

    // マッピングテーブルを使って復元
    for (const [maskLabel, originalText] of mappingTable.entries()) {
      restoredText = restoredText.replaceAll(maskLabel, originalText);
    }

    return restoredText;
  }

  /**
   * カスタムパターンを追加
   * @param {string} key - パターンのキー
   * @param {RegExp} regex - 正規表現
   * @param {string} label - マスキング時のラベル
   * @param {string} description - 説明
   */
  addCustomPattern(key, regex, label, description) {
    this.patterns[key] = {
      regex,
      label,
      description
    };
  }

  /**
   * パターンを削除
   * @param {string} key - パターンのキー
   */
  removePattern(key) {
    delete this.patterns[key];
  }

  /**
   * 利用可能なパターン一覧を取得
   * @return {Array} パターン情報の配列
   */
  getAvailablePatterns() {
    return Object.entries(this.patterns).map(([key, config]) => ({
      key,
      label: config.label,
      description: config.description
    }));
  }

  /**
   * テキスト内の個人情報を検知（マスキングせず検知のみ）
   * @param {string} text - チェックするテキスト
   * @return {Object} 検知結果のサマリー
   */
  detect(text) {
    if (!text) return { hasPersonalInfo: false, summary: {} };

    const summary = {};
    let totalDetections = 0;

    for (const [patternKey, patternConfig] of Object.entries(this.patterns)) {
      const matches = [...text.matchAll(patternConfig.regex)];
      if (matches.length > 0) {
        summary[patternKey] = {
          count: matches.length,
          description: patternConfig.description,
          samples: matches.slice(0, 3).map(m => m[0]) // 最初の3つのみ
        };
        totalDetections += matches.length;
      }
    }

    return {
      hasPersonalInfo: totalDetections > 0,
      totalDetections,
      summary
    };
  }

  /**
   * マスキング結果の統計を取得
   * @param {Array} detections - 検知結果の配列
   * @return {Object} 統計情報
   */
  getStatistics(detections) {
    const stats = {};
    
    for (const detection of detections) {
      if (!stats[detection.type]) {
        stats[detection.type] = {
          description: detection.description,
          count: 0
        };
      }
      stats[detection.type].count++;
    }

    return stats;
  }
}

// エクスポート（Chrome拡張で使用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MaskingEngine;
}

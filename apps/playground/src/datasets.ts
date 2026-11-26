import type { CsvFilePayload, FileSystemAdapter } from '@meta-csv/core';

export const SPEC_SETTING_CSV = [
  'A-9,MH-TranStroke,履歴・プリセット,プリセット,PresetSlotsAndLauncher,プリセット保存・切替（最大4スロット）・プリセット通知＆ランチャー',
  'A-10,MH-TranStroke,キー・マウス,キー,DynamicKeyStrokeDisplay,動的ストローク表示（打鍵キーの動的オーバーレイ表示）',
  'A-11,MH-TranStroke,キー・マウス,表示,HideAppLogoBadge,画面右上のアプリ名ロゴを非表示にする',
  'A-12,MH-TranStroke,キー・マウス,マウス,CustomizeMouseColor,マウスの色変更（カラーピッカー・プリセット色）',
  'B-1,MH-NewsTicker,基本・外観,表示,TickerBarDisplay,画面上端/下端ティッカー表示（AppBarドッキング/オーバーレイ）',
  'B-2,MH-NewsTicker,基本・外観,表示,LedDotMatrixTheme,LED電光掲示板/レトロ液晶LCDドットマトリクス表示モード',
  'B-3,MH-NewsTicker,フィード,フィード,FeedManagementAndOpml,RSS/Atomフィード管理・URL自動検出・OPML入出力',
  'B-4,MH-NewsTicker,基本・外観,フィルター,WordFilterAndUnread,強調ワード・NGワードフィルター・未読のみ表示',
  'B-5,MH-NewsTicker,リーダー,閲覧,HoverReaderSimple,ホバープレビュー（シンプル/HTMLリッチ）＆記事リーダー',
  'B-6,MH-NewsTicker,リーダー,閲覧,HoverReaderWebView2,WebView2 ミニブラウザプレビュー',
  'B-7,MH-NewsTicker,音声読み上げ,音声,SpeechReadAloudAivis,ニュース音声読み上げ（AivisSpeech連携）',
  'B-8,MH-NewsTicker,外部RSS連携(β),同期,ExternalRssAndSync,外部RSS連携（β）＆複数PC間データ同期',
  'C-1,MH-HachaMechaType,演奏,演奏,PlayImprovisedMelody,即興メロディ演奏（音階＝スケール・内蔵シンセ・外部MIDI OUT）',
  'C-2,MH-HachaMechaType,演奏,演奏,PlayAutoBacking,自動バッキング演奏（プリセット伴奏）',
  'C-3,MH-HachaMechaType,演奏,演奏,PlayClassicAutoSong,名曲自動進行モード（カノン・ハレルヤ等）',
  'C-4,MH-HachaMechaType,演奏,演奏,PlayGimmicks,ギミック演奏（アルペジオ/ジョギング/ドラムフィル/ファンファーレ）',
  'C-5,MH-HachaMechaType,演奏,演奏,PlayMouseAdlibAndTap,マウスアドリブ/タップ演奏（左右クリック・ホイール対応）',
  'C-6,MH-HachaMechaType,演奏,録音,RecordMicRealtimeScale,マイクリアルタイム録音＆音階化（ボーカルサンプル生成）',
].join('\r\n');

export const SPEC_SETTING_META = `{
  "$schema": "./metacsv.schema.json",
  "version": "0.1",

  // ヘッダー行が無い仕様一覧 CSV の例
  "csv": {
    "hasHeader": false,
    "encoding": "utf-8",
    "lineEnding": "crlf"
  },

  "table": {
    "fontFamily": "'Segoe UI', 'Yu Gothic UI', sans-serif",
    "fontSize": 13,
    "defaultRowHeight": 28,
    "freezeColumns": 1
  },

  "styles": {
    "appBlue": { "backgroundColor": "rgba(59, 130, 246, 0.16)" },
    "appGreen": { "backgroundColor": "rgba(16, 185, 129, 0.16)" },
    "appAmber": { "backgroundColor": "rgba(245, 158, 11, 0.16)" },
    "codeCell": { "fontFamily": "'Consolas', monospace" },
    "noteHighlight": { "backgroundColor": "rgba(250, 204, 21, 0.16)", "italic": true }
  },

  "columns": {
    "0": {
      "label": "ID",
      "width": 72,
      "align": "center",
      "readonly": true,
      "style": { "bold": true }
    },
    "1": {
      "label": "アプリ",
      "width": 160
    },
    "2": {
      "label": "大分類",
      "width": 120
    },
    "3": {
      "label": "中分類",
      "width": 100
    },
    "4": {
      "label": "設定キー",
      "width": 210,
      "style": "codeCell"
    },
    "5": {
      // 長文の説明列は広めに確保
      "label": "説明",
      "width": 440,
      "wrap": true
    }
  },

  // アプリごとに背景色を色分け（ソートしてもズレない）
  "rules": [
    {
      "name": "MH-TranStroke",
      "when": { "column": "1", "operator": "equals", "value": "MH-TranStroke" },
      "style": "appBlue"
    },
    {
      "name": "MH-NewsTicker",
      "when": { "column": "1", "operator": "equals", "value": "MH-NewsTicker" },
      "style": "appGreen"
    },
    {
      "name": "MH-HachaMechaType",
      "when": { "column": "1", "operator": "equals", "value": "MH-HachaMechaType" },
      "style": "appAmber"
    }
  ],

  "ranges": [
    { "ref": "4:2..5:3", "style": "noteHighlight" }
  ],

  "rows": {
    "0": { "height": 40 }
  }
}
`;

export function generateLargeCsvBytes(rowCount = 100_000): Uint8Array {
  const apps = ['MH-TranStroke', 'MH-NewsTicker', 'MH-HachaMechaType', 'MH-CatEye'];
  const statuses = ['done', 'wip', 'todo', 'review'];
  const lines: string[] = new Array(rowCount + 1);
  lines[0] = 'id,app,category,status,key,priority,owner,description';

  for (let i = 1; i <= rowCount; i++) {
    const app = apps[i % apps.length];
    const status = statuses[i % statuses.length];
    lines[i] =
      `ROW-${String(i).padStart(6, '0')},${app},Cat-${i % 12},${status},SettingKey_${i},${(i % 5) + 1},dev${(i % 4) + 1},Sample description text for row #${i} to verify 60fps Canvas scrolling`;
  }
  return new TextEncoder().encode(lines.join('\n'));
}

export const LARGE_CSV_META = `{
  "version": "0.1",
  // 10万行ベンチマーク用メタデータ
  "csv": { "hasHeader": true },
  "table": { "freezeColumns": 1, "defaultRowHeight": 26 },
  "styles": {
    "done": { "backgroundColor": "rgba(16, 185, 129, 0.16)" },
    "wip": { "backgroundColor": "rgba(59, 130, 246, 0.16)" },
    "review": { "backgroundColor": "rgba(245, 158, 11, 0.16)" }
  },
  "columns": {
    "id": { "width": 110, "readonly": true, "style": { "bold": true } },
    "app": { "width": 150 },
    "status": { "width": 90, "align": "center" },
    "description": { "width": 380 }
  },
  "rules": [
    { "when": { "column": "status", "operator": "equals", "value": "done" }, "style": "done" },
    { "when": { "column": "status", "operator": "equals", "value": "wip" }, "style": "wip" },
    { "when": { "column": "status", "operator": "equals", "value": "review" }, "style": "review" }
  ]
}
`;

function triggerBrowserDownload(fileName: string, bytes: Uint8Array): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createMemoryAdapter(initial: CsvFilePayload): FileSystemAdapter {
  let csvBytes = initial.csvBytes;
  let metaText = initial.metaText;
  const fileName = initial.fileName;

  return {
    async load() {
      // Return a copy so zero-copy Worker ArrayBuffer transfer never detaches stored bytes
      return { fileName, csvBytes: csvBytes.slice(), metaText };
    },
    async saveCsv(bytes: Uint8Array) {
      csvBytes = bytes.slice();
      triggerBrowserDownload(fileName, csvBytes);
    },
    async saveMeta(text: string) {
      metaText = text;
    },
  };
}

export function createFileAdapter(
  file: File,
  initialMetaText: string | null = null,
): FileSystemAdapter {
  let savedBytes: Uint8Array | null = null;
  let metaText = initialMetaText;

  return {
    async load() {
      const csvBytes = savedBytes
        ? savedBytes.slice()
        : new Uint8Array(await file.arrayBuffer());
      return { fileName: file.name, csvBytes, metaText };
    },
    async saveCsv(bytes: Uint8Array) {
      savedBytes = bytes.slice();
      triggerBrowserDownload(file.name, savedBytes);
    },
    async saveMeta(text: string) {
      metaText = text;
    },
  };
}

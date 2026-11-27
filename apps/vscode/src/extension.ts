import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { HistoryRetentionPolicy } from '@metatext-editor/core';
import {
  DEFAULT_VSCODE_HISTORY_POLICY,
  createNodeIsomorphicHistoryAdapter,
} from './isomorphicHistory';
import {
  exportMetaTextBundleNode,
  extractBundleHistoryToTempNode,
  loadMetaTextBundleNode,
  saveMetaTextBundleNode,
  saveMetaTextBundleSnapshotNode,
} from './bundleExport';

type SidecarVisibilityMode = 'nest' | 'hide' | 'show';
type LanguageSetting = 'auto' | 'en' | 'ja' | 'zh-cn' | 'zh-tw' | 'ko' | 'de' | 'fr' | 'es';

interface VsCodeAppSettings {
  language: LanguageSetting;
  defaultFontSize: number;
  defaultRowHeight: number;
  defaultMarkerColor: 'amber' | 'rose' | 'emerald' | 'sky' | 'violet';
  showRowNumbers: boolean;
  noHeaderColumnStyle: 'excel' | 'numbered';
  sidecarVisibility: SidecarVisibilityMode;
}

const SIDECAR_EXCLUDE_GLOB = '**/*.metatext.jsonc';
const HISTORY_EXCLUDE_GLOB = '**/*.metatext.history';
const SIDECAR_NESTING_PATTERNS: Record<string, string> = {
  '*.csv': '${capture}.csv.metatext.jsonc',
  '*.tsv': '${capture}.tsv.metatext.jsonc',
  '*.jsonl': '${capture}.jsonl.metatext.jsonc',
  '*.ndjson': '${capture}.ndjson.metatext.jsonc',
  '*.log': '${capture}.log.metatext.jsonc',
};

interface EditorStatusPayload {
  totalRows?: number;
  visibleRows?: number;
  cols?: number;
  zoomScale?: number;
  format?: string;
  readOnly?: boolean;
}

class MetaTextDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}

  dispose(): void {
    // Nothing to dispose
  }
}

class MetaTextEditorProvider implements vscode.CustomEditorProvider<MetaTextDocument> {
  public static readonly viewType = 'metatext.editor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<MetaTextDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly panelsByDoc = new Map<string, vscode.WebviewPanel>();
  private readonly statusByDoc = new Map<string, { prefix: string; dims: string }>();
  private readonly zoomByDoc = new Map<string, number>();
  private readonly pendingCsvRequests = new Map<
    number,
    { resolve: (bytes: Buffer) => void; reject: (err: Error) => void }
  >();
  private nextRequestId = 1;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusBarItem: vscode.StatusBarItem,
  ) {}

  private formatStatusBarText(docKey: string): string | undefined {
    const info = this.statusByDoc.get(docKey);
    if (!info) return undefined;
    const zoomPct = Math.round((this.zoomByDoc.get(docKey) ?? 1) * 100);
    return `${info.prefix}: ${zoomPct}% ${info.dims}`;
  }

  private refreshStatusBarForActivePanel(): void {
    for (const [docKey, panel] of this.panelsByDoc.entries()) {
      if (panel.active) {
        const text = this.formatStatusBarText(docKey);
        if (text) {
          this.statusBarItem.text = text;
          this.statusBarItem.show();
        } else {
          this.statusBarItem.hide();
        }
        return;
      }
    }
    this.statusBarItem.hide();
  }

  public async promptZoomSelection(): Promise<void> {
    let activePanel: vscode.WebviewPanel | undefined;
    let currentZoom = 1;
    for (const [docKey, panel] of this.panelsByDoc.entries()) {
      if (panel.active) {
        activePanel = panel;
        currentZoom = this.zoomByDoc.get(docKey) ?? 1;
        break;
      }
    }
    if (!activePanel) return;

    const presets = [0.6, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5];
    const items = presets.map((scale) => {
      const pct = Math.round(scale * 100);
      return {
        label: `${pct}%`,
        description: Math.abs(scale - currentZoom) < 0.005 ? 'Current' : scale === 1 ? 'Default' : undefined,
        scale,
      };
    });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Select MetaText Editor zoom level (current: ${Math.round(currentZoom * 100)}%) — Ctrl+Wheel, Ctrl+0`,
    });
    if (!picked) return;
    await activePanel.webview.postMessage({
      type: 'hostCommand',
      command: 'setZoom',
      scale: picked.scale,
    });
  }

  async openCustomDocument(uri: vscode.Uri): Promise<MetaTextDocument> {
    return new MetaTextDocument(uri);
  }

  private async requestCsvBytesFromWebview(document: MetaTextDocument): Promise<Buffer> {
    const panel = this.panelsByDoc.get(document.uri.toString());
    if (!panel) {
      throw new Error('Editor panel is not active.');
    }
    const requestId = this.nextRequestId++;
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingCsvRequests.has(requestId)) {
          this.pendingCsvRequests.delete(requestId);
          reject(new Error('Timed out waiting for serialized CSV data from webview.'));
        }
      }, 10_000);
      this.pendingCsvRequests.set(requestId, {
        resolve: (buf) => {
          clearTimeout(timer);
          resolve(buf);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      void panel.webview.postMessage({ type: 'hostCommand', command: 'requestCsvData', requestId });
    });
  }

  async saveCustomDocument(document: MetaTextDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const buf = await this.requestCsvBytesFromWebview(document);
    const isBundle = document.uri.fsPath.toLowerCase().endsWith('.metatext.zip');
    if (isBundle) {
      await saveMetaTextBundleNode(document.uri.fsPath, { dataBytes: new Uint8Array(buf) });
    } else {
      await fs.writeFile(document.uri.fsPath, buf);
    }
    const panel = this.panelsByDoc.get(document.uri.toString());
    if (panel) {
      await panel.webview.postMessage({ type: 'hostCommand', command: 'hostSaved' });
    }
    // Fire-and-forget background Shadow Git snapshot (inside ZIP history/ for bundles, or adjacent .metatext.history/)
    void (async () => {
      if (panel) {
        void panel.webview.postMessage({
          type: 'hostCommand',
          command: 'historySaving',
          saving: true,
        });
      }
      try {
        if (isBundle) {
          const loaded = await loadMetaTextBundleNode(document.uri.fsPath);
          await saveMetaTextBundleSnapshotNode(document.uri.fsPath, {
            message: `Saved ${loaded.fileName}`,
            includeData: true,
            metaText: loaded.metaText,
            policy: DEFAULT_VSCODE_HISTORY_POLICY,
          });
        } else {
          const metaPath = `${document.uri.fsPath}.metatext.jsonc`;
          const metaText = await fs.readFile(metaPath, 'utf-8').catch(() => '');
          const historyAdapter = createNodeIsomorphicHistoryAdapter(document.uri.fsPath);
          await historyAdapter.saveSnapshot({
            message: `Saved ${path.basename(document.uri.fsPath)}`,
            includeDataFromDisk: true,
            metaText,
            policy: DEFAULT_VSCODE_HISTORY_POLICY,
          });
        }
      } catch (err) {
        console.error('[MetaText VS Code] Failed to save Shadow Git snapshot:', err);
      } finally {
        if (panel) {
          void panel.webview.postMessage({
            type: 'hostCommand',
            command: 'historySaving',
            saving: false,
          });
          void panel.webview.postMessage({
            type: 'hostCommand',
            command: 'historyUpdated',
          });
        }
      }
    })();
  }

  async saveCustomDocumentAs(
    document: MetaTextDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const buf = await this.requestCsvBytesFromWebview(document);
    await fs.writeFile(destination.fsPath, buf);
    const srcMeta = `${document.uri.fsPath}.metatext.jsonc`;
    const dstMeta = `${destination.fsPath}.metatext.jsonc`;
    try {
      const metaText = await fs.readFile(srcMeta, 'utf-8');
      await fs.writeFile(dstMeta, metaText, 'utf-8');
    } catch {
      // Optional sidecar
    }
    const panel = this.panelsByDoc.get(document.uri.toString());
    if (panel) {
      await panel.webview.postMessage({ type: 'hostCommand', command: 'hostSaved' });
    }
  }

  async revertCustomDocument(document: MetaTextDocument, _cancellation: vscode.CancellationToken): Promise<void> {
    const panel = this.panelsByDoc.get(document.uri.toString());
    if (panel) {
      await panel.webview.postMessage({ type: 'hostCommand', command: 'reload' });
    }
  }

  async backupCustomDocument(
    _document: MetaTextDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    return {
      id: context.destination.toString(),
      delete: () => {
        // Nothing persisted
      },
    };
  }

  async resolveCustomEditor(
    document: MetaTextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const docKey = document.uri.toString();
    this.panelsByDoc.set(docKey, webviewPanel);

    webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot],
    };

    webview.html = this.getHtmlForWebview(webview, webviewRoot);

    const csvPath = document.uri.fsPath;
    const isBundle = csvPath.toLowerCase().endsWith('.metatext.zip');
    const metaPath = `${csvPath}.metatext.jsonc`;

    const sendFilePayload = async () => {
      try {
        let fileName = path.basename(csvPath);
        let csvBuffer: Buffer;
        let metaText: string | null = null;

        if (isBundle) {
          const loaded = await loadMetaTextBundleNode(csvPath);
          csvBuffer = Buffer.from(loaded.dataBytes);
          metaText = loaded.metaText;
        } else {
          csvBuffer = await fs.readFile(csvPath);
          try {
            metaText = await fs.readFile(metaPath, 'utf-8');
          } catch {
            metaText = null;
          }
        }

        await webview.postMessage({
          type: 'loaded',
          payload: {
            fileName,
            csvBase64: csvBuffer.toString('base64'),
            metaText,
            themeMode: getThemeMode(),
            hostLanguage: vscode.env.language,
            appSettings: readAppSettings(),
          },
        });
      } catch (err) {
        await webview.postMessage({
          type: 'error',
          message: String(err),
        });
      }
    };

    const msgDisposable = webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message !== 'object') return;

      switch (message.type) {
        case 'ready':
          await sendFilePayload();
          break;

        case 'historyList': {
          const requestId = Number(message.requestId ?? 0);
          try {
            const gitdir = isBundle ? await extractBundleHistoryToTempNode(csvPath) : undefined;
            if (isBundle && !gitdir) {
              await webview.postMessage({
                type: 'historyListResult',
                requestId,
                snapshots: [],
                usageBytes: 0,
              });
              break;
            }
            const historyAdapter = createNodeIsomorphicHistoryAdapter(csvPath, gitdir ?? undefined);
            const [snapshots, usageBytes] = await Promise.all([
              historyAdapter.listSnapshots(Number(message.limit ?? 50)),
              historyAdapter.getStorageUsageBytes ? historyAdapter.getStorageUsageBytes() : Promise.resolve(0),
            ]);
            await webview.postMessage({ type: 'historyListResult', requestId, snapshots, usageBytes });
          } catch (err) {
            await webview.postMessage({ type: 'historyError', requestId, message: String(err) });
          }
          break;
        }

        case 'historySave': {
          const requestId = Number(message.requestId ?? 0);
          try {
            const policy = (message.policy ?? DEFAULT_VSCODE_HISTORY_POLICY) as HistoryRetentionPolicy;
            const saved = isBundle
              ? await saveMetaTextBundleSnapshotNode(csvPath, {
                  message: String(message.message ?? `Saved ${path.basename(csvPath)}`),
                  includeData: Boolean(message.includeDataFromDisk),
                  metaText: String(message.metaText ?? ''),
                  policy,
                })
              : await createNodeIsomorphicHistoryAdapter(csvPath).saveSnapshot({
                  message: String(message.message ?? `Saved ${path.basename(csvPath)}`),
                  includeDataFromDisk: Boolean(message.includeDataFromDisk),
                  metaText: String(message.metaText ?? ''),
                  policy,
                });
            await webview.postMessage({ type: 'historySaveResult', requestId, snapshot: saved });
          } catch (err) {
            await webview.postMessage({ type: 'historyError', requestId, message: String(err) });
          }
          break;
        }

        case 'historyRestore': {
          const requestId = Number(message.requestId ?? 0);
          try {
            const gitdir = isBundle ? await extractBundleHistoryToTempNode(csvPath) : undefined;
            if (isBundle && !gitdir) {
              throw new Error('No history exists in this bundle');
            }
            const historyAdapter = createNodeIsomorphicHistoryAdapter(csvPath, gitdir ?? undefined);
            const payload = await historyAdapter.restoreSnapshot(String(message.id ?? ''));
            await webview.postMessage({
              type: 'historyRestoreResult',
              requestId,
              id: payload.id,
              dataBase64: payload.dataBytes ? Buffer.from(payload.dataBytes).toString('base64') : undefined,
              metaText: payload.metaText,
            });
          } catch (err) {
            await webview.postMessage({ type: 'historyError', requestId, message: String(err) });
          }
          break;
        }

        case 'historyUsage': {
          const requestId = Number(message.requestId ?? 0);
          try {
            const gitdir = isBundle ? await extractBundleHistoryToTempNode(csvPath) : undefined;
            if (isBundle && !gitdir) {
              await webview.postMessage({ type: 'historyUsageResult', requestId, usageBytes: 0 });
              break;
            }
            const historyAdapter = createNodeIsomorphicHistoryAdapter(csvPath, gitdir ?? undefined);
            const usageBytes = historyAdapter.getStorageUsageBytes
              ? await historyAdapter.getStorageUsageBytes()
              : 0;
            await webview.postMessage({ type: 'historyUsageResult', requestId, usageBytes });
          } catch (err) {
            await webview.postMessage({ type: 'historyError', requestId, message: String(err) });
          }
          break;
        }

        case 'exportBundle': {
          const requestId = Number(message.requestId ?? 0);
          try {
            const includeHistory = Boolean(message.includeHistory);
            const defaultName = `${path.basename(csvPath)}.metatext.zip`;
            const defaultUri = vscode.Uri.file(path.join(path.dirname(csvPath), defaultName));
            const targetUri = await vscode.window.showSaveDialog({
              defaultUri,
              filters: { 'MetaText Bundle': ['zip'] },
              saveLabel: 'Export .metatext.zip',
            });
            if (!targetUri) {
              await webview.postMessage({
                type: 'exportBundleResult',
                requestId,
                cancelled: true,
              });
              break;
            }
            const res = await exportMetaTextBundleNode(csvPath, targetUri.fsPath, includeHistory);
            await webview.postMessage({
              type: 'exportBundleResult',
              requestId,
              cancelled: false,
              fileName: path.basename(res.destPath),
            });
          } catch (err) {
            await webview.postMessage({ type: 'historyError', requestId, message: String(err) });
          }
          break;
        }

        case 'readAppend': {
          const requestId = Number(message.requestId ?? 0);
          const fromOffset = Math.max(0, Number(message.fromOffset ?? 0));
          try {
            const fh = await fs.open(csvPath, 'r');
            try {
              const stat = await fh.stat();
              if (stat.size < fromOffset) {
                await webview.postMessage({
                  type: 'appendData',
                  requestId,
                  bytesBase64: '',
                  nextOffset: stat.size,
                  truncated: true,
                });
              } else if (stat.size === fromOffset) {
                await webview.postMessage({
                  type: 'appendData',
                  requestId,
                  bytesBase64: '',
                  nextOffset: fromOffset,
                  truncated: false,
                });
              } else {
                const maxChunk = 4 * 1024 * 1024;
                const toRead = Math.min(stat.size - fromOffset, maxChunk);
                const buf = Buffer.allocUnsafe(toRead);
                const { bytesRead } = await fh.read(buf, 0, toRead, fromOffset);
                await webview.postMessage({
                  type: 'appendData',
                  requestId,
                  bytesBase64: buf.subarray(0, bytesRead).toString('base64'),
                  nextOffset: fromOffset + bytesRead,
                  truncated: false,
                });
              }
            } finally {
              await fh.close();
            }
          } catch (err) {
            await webview.postMessage({
              type: 'appendError',
              requestId,
              message: String(err),
            });
          }
          break;
        }

        case 'openSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'metatext.');
          break;

        case 'updateConfig': {
          const patch = message.patch as Record<string, unknown> | undefined;
          if (patch && typeof patch === 'object') {
            const cfg = vscode.workspace.getConfiguration('metatext');
            const allowedKeys = [
              'language',
              'defaultFontSize',
              'defaultRowHeight',
              'defaultMarkerColor',
              'showRowNumbers',
              'noHeaderColumnStyle',
              'sidecarVisibility',
            ];
            for (const key of allowedKeys) {
              if (patch[key] !== undefined) {
                await cfg.update(key, patch[key], vscode.ConfigurationTarget.Global);
              }
            }
          }
          break;
        }

        case 'statusChanged': {
          const st = (message.status ?? {}) as EditorStatusPayload;
          const totalRows = Number(st.totalRows ?? 0);
          const visibleRows = Number(st.visibleRows ?? totalRows);
          const cols = Number(st.cols ?? 0);
          if (typeof st.zoomScale === 'number' && Number.isFinite(st.zoomScale)) {
            this.zoomByDoc.set(docKey, st.zoomScale);
          }
          if (cols > 0) {
            const tags: string[] = [];
            if (st.format && st.format !== 'csv') tags.push(st.format.toUpperCase());
            if (st.readOnly) tags.push('RO');
            const prefix = tags.length > 0 ? `MetaText Editor [${tags.join(' · ')}]` : 'MetaText Editor';
            const dims =
              visibleRows !== totalRows
                ? `Rows=${visibleRows.toLocaleString()}/${totalRows.toLocaleString()}, Cols=${cols}`
                : `Rows=${totalRows.toLocaleString()}, Cols=${cols}`;
            this.statusByDoc.set(docKey, { prefix, dims });
          }
          if (webviewPanel.active) {
            const text = this.formatStatusBarText(docKey);
            if (text) {
              this.statusBarItem.text = text;
              this.statusBarItem.show();
            }
          }
          break;
        }

        case 'documentEdited':
          this._onDidChangeCustomDocument.fire({
            document,
            label: String(message.label ?? 'Edit CSV'),
            undo: async () => {
              await webview.postMessage({ type: 'hostCommand', command: 'undo' });
            },
            redo: async () => {
              await webview.postMessage({ type: 'hostCommand', command: 'redo' });
            },
          });
          break;

        case 'csvDataResponse': {
          const reqId = Number(message.requestId);
          const pending = this.pendingCsvRequests.get(reqId);
          if (pending) {
            this.pendingCsvRequests.delete(reqId);
            if (typeof message.csvBase64 === 'string') {
              pending.resolve(Buffer.from(message.csvBase64, 'base64'));
            } else {
              pending.reject(new Error('CSV data unavailable from webview.'));
            }
          }
          break;
        }

        case 'saveCsv': {
          try {
            const buf = Buffer.from(String(message.csvBase64 ?? ''), 'base64');
            if (isBundle) {
              await saveMetaTextBundleNode(csvPath, { dataBytes: new Uint8Array(buf) });
            } else {
              await fs.writeFile(csvPath, buf);
            }
            await webview.postMessage({ type: 'saved', target: 'csv', requestId: message.requestId });
          } catch (err) {
            void vscode.window.showErrorMessage(`MetaText Editor: Failed to save CSV: ${String(err)}`);
            await webview.postMessage({
              type: 'saveError',
              requestId: message.requestId,
              message: String(err),
            });
          }
          break;
        }

        case 'saveMeta': {
          try {
            const nextMeta = String(message.metaText ?? '');
            if (isBundle) {
              await saveMetaTextBundleNode(csvPath, { metaText: nextMeta });
            } else {
              await fs.writeFile(metaPath, nextMeta, 'utf-8');
            }
            await webview.postMessage({ type: 'saved', target: 'meta', requestId: message.requestId });
          } catch (err) {
            void vscode.window.showErrorMessage(`MetaText Editor: Failed to save .metatext.jsonc: ${String(err)}`);
            await webview.postMessage({
              type: 'saveError',
              requestId: message.requestId,
              message: String(err),
            });
          }
          break;
        }
      }
    });

    const viewStateDisposable = webviewPanel.onDidChangeViewState(() => {
      this.refreshStatusBarForActivePanel();
    });

    const themeDisposable = vscode.window.onDidChangeActiveColorTheme(() => {
      void webview.postMessage({
        type: 'themeChanged',
        themeMode: getThemeMode(),
      });
    });

    const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('metatext')) {
        void webview.postMessage({
          type: 'configChanged',
          appSettings: readAppSettings(),
        });
      }
    });

    webviewPanel.onDidDispose(() => {
      this.panelsByDoc.delete(docKey);
      this.statusByDoc.delete(docKey);
      msgDisposable.dispose();
      viewStateDisposable.dispose();
      themeDisposable.dispose();
      configDisposable.dispose();
      this.refreshStatusBarForActivePanel();
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'index.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource} blob:; worker-src blob:; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} data:;"
    />
    <link rel="stylesheet" href="${styleUri}" />
    <title>MetaText Editor</title>
  </head>
  <body style="margin:0;padding:0;overflow:hidden;width:100vw;height:100vh;">
    <div id="root" style="width:100%;height:100%;"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
    <div id="portal" style="position:fixed;left:0;top:0;z-index:9999;"></div>
  </body>
</html>`;
  }
}

function readAppSettings(): VsCodeAppSettings {
  const cfg = vscode.workspace.getConfiguration('metatext');
  const rawLang = cfg.get<string>('language', 'auto');
  const language: LanguageSetting =
    rawLang === 'en' ||
    rawLang === 'ja' ||
    rawLang === 'zh-cn' ||
    rawLang === 'zh-tw' ||
    rawLang === 'ko' ||
    rawLang === 'de' ||
    rawLang === 'fr' ||
    rawLang === 'es'
      ? rawLang
      : 'auto';
  const rawColor = cfg.get<string>('defaultMarkerColor', 'amber');
  const defaultMarkerColor =
    rawColor === 'amber' ||
    rawColor === 'rose' ||
    rawColor === 'emerald' ||
    rawColor === 'sky' ||
    rawColor === 'violet'
      ? rawColor
      : 'amber';
  const rawColStyle = cfg.get<string>('noHeaderColumnStyle', 'excel');
  const noHeaderColumnStyle = rawColStyle === 'numbered' ? 'numbered' : 'excel';
  const rawSidecar = cfg.get<string>('sidecarVisibility', 'nest');
  const sidecarVisibility: SidecarVisibilityMode =
    rawSidecar === 'hide' || rawSidecar === 'show' ? rawSidecar : 'nest';
  return {
    language,
    defaultFontSize: cfg.get<number>('defaultFontSize', 13),
    defaultRowHeight: cfg.get<number>('defaultRowHeight', 28),
    defaultMarkerColor,
    showRowNumbers: cfg.get<boolean>('showRowNumbers', true),
    noHeaderColumnStyle,
    sidecarVisibility,
  };
}

async function syncSidecarVisibility(): Promise<void> {
  const mode = readAppSettings().sidecarVisibility;

  // 1. Sync files.exclude (preserving all user-defined rules):
  //    - **/*.metatext.jsonc: hidden in 'hide' mode
  //    - **/*.metatext.history: hidden in 'nest' and 'hide' modes (VS Code fileNesting does not nest folders)
  const filesCfg = vscode.workspace.getConfiguration('files');
  const inspectedExclude = filesCfg.inspect<Record<string, boolean>>('exclude');
  const currentExclude = { ...(inspectedExclude?.globalValue ?? {}) };
  let excludeChanged = false;
  if (mode === 'hide') {
    if (currentExclude[SIDECAR_EXCLUDE_GLOB] !== true) {
      currentExclude[SIDECAR_EXCLUDE_GLOB] = true;
      excludeChanged = true;
    }
  } else if (SIDECAR_EXCLUDE_GLOB in currentExclude) {
    delete currentExclude[SIDECAR_EXCLUDE_GLOB];
    excludeChanged = true;
  }
  if (mode === 'nest' || mode === 'hide') {
    if (currentExclude[HISTORY_EXCLUDE_GLOB] !== true) {
      currentExclude[HISTORY_EXCLUDE_GLOB] = true;
      excludeChanged = true;
    }
  } else if (HISTORY_EXCLUDE_GLOB in currentExclude) {
    delete currentExclude[HISTORY_EXCLUDE_GLOB];
    excludeChanged = true;
  }
  if (excludeChanged) {
    await filesCfg.update(
      'exclude',
      Object.keys(currentExclude).length > 0 ? currentExclude : undefined,
      vscode.ConfigurationTarget.Global,
    );
  }

  // 2. Sync explorer.fileNesting for 'nest' mode (preserving all user-defined patterns)
  const explorerCfg = vscode.workspace.getConfiguration('explorer');
  const inspectedPatterns = explorerCfg.inspect<Record<string, string>>('fileNesting.patterns');
  const nextPatterns = { ...(inspectedPatterns?.globalValue ?? {}) };
  let patternsChanged = false;

  if (mode === 'nest') {
    if (explorerCfg.get<boolean>('fileNesting.enabled') !== true) {
      await explorerCfg.update('fileNesting.enabled', true, vscode.ConfigurationTarget.Global);
    }
    const inspectedExpand = explorerCfg.inspect<boolean>('fileNesting.expand');
    if (inspectedExpand?.globalValue === undefined) {
      await explorerCfg.update('fileNesting.expand', false, vscode.ConfigurationTarget.Global);
    }
    for (const [key, pattern] of Object.entries(SIDECAR_NESTING_PATTERNS)) {
      const existing = nextPatterns[key] ?? '';
      const tokens = existing
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!tokens.includes(pattern)) {
        tokens.push(pattern);
        nextPatterns[key] = tokens.join(', ');
        patternsChanged = true;
      }
    }
  } else {
    for (const [key, pattern] of Object.entries(SIDECAR_NESTING_PATTERNS)) {
      const existing = nextPatterns[key];
      if (!existing) continue;
      const tokens = existing
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const filtered = tokens.filter((t) => t !== pattern);
      if (filtered.length !== tokens.length) {
        if (filtered.length > 0) {
          nextPatterns[key] = filtered.join(', ');
        } else {
          delete nextPatterns[key];
        }
        patternsChanged = true;
      }
    }
  }

  if (patternsChanged) {
    await explorerCfg.update(
      'fileNesting.patterns',
      Object.keys(nextPatterns).length > 0 ? nextPatterns : undefined,
      vscode.ConfigurationTarget.Global,
    );
  }
}

function getThemeMode(): 'light' | 'dark' {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? 'light'
    : 'dark';
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.tooltip = 'MetaText Editor: Click to change zoom (Ctrl+Wheel, Ctrl+0)';
  statusBarItem.command = 'metatext.selectZoom';
  context.subscriptions.push(statusBarItem);

  const provider = new MetaTextEditorProvider(context, statusBarItem);
  const editorOpts = {
    webviewOptions: {
      retainContextWhenHidden: true,
    },
    supportsMultipleEditorsPerDocument: false,
  };
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MetaTextEditorProvider.viewType, provider, editorOpts),
    vscode.window.registerCustomEditorProvider('metatext.bundleEditor', provider, editorOpts),
    vscode.window.registerFileDecorationProvider({
      provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (!uri.fsPath.toLowerCase().endsWith('.metatext.zip')) {
          return undefined;
        }
        return {
          badge: 'MT',
          color: new vscode.ThemeColor('charts.orange'),
          tooltip: 'MetaText Portable Bundle (.metatext.zip)',
        };
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('metatext.selectZoom', async () => {
      await provider.promptZoomSelection();
    }),
  );

  void syncSidecarVisibility();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('metatext.sidecarVisibility')) {
        void syncSidecarVisibility();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('metatext.openWithEditor', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        void vscode.window.showWarningMessage('MetaText Editor: No file selected.');
        return;
      }
      const lowerPath = targetUri.fsPath.toLowerCase();
      if (lowerPath.endsWith('.zip') && !lowerPath.endsWith('.metatext.zip')) {
        void vscode.window.showWarningMessage(
          'MetaText Editor: Only ".metatext.zip" bundles are supported (regular .zip files cannot be opened).',
        );
        return;
      }
      const targetViewType = lowerPath.endsWith('.metatext.zip')
        ? 'metatext.bundleEditor'
        : MetaTextEditorProvider.viewType;
      await vscode.commands.executeCommand('vscode.openWith', targetUri, targetViewType);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}

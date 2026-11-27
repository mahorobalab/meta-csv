import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface VsCodeAppSettings {
  defaultFontSize: number;
  defaultRowHeight: number;
  defaultMarkerColor: 'amber' | 'rose' | 'emerald' | 'sky' | 'violet';
  showRowNumbers: boolean;
  noHeaderColumnStyle: 'excel' | 'numbered';
}

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
    await fs.writeFile(document.uri.fsPath, buf);
    const panel = this.panelsByDoc.get(document.uri.toString());
    if (panel) {
      await panel.webview.postMessage({ type: 'hostCommand', command: 'hostSaved' });
    }
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
    const metaPath = `${csvPath}.metatext.jsonc`;

    const sendFilePayload = async () => {
      try {
        const csvBuffer = await fs.readFile(csvPath);
        let metaText: string | null = null;
        try {
          metaText = await fs.readFile(metaPath, 'utf-8');
        } catch {
          metaText = null;
        }

        await webview.postMessage({
          type: 'loaded',
          payload: {
            fileName: path.basename(csvPath),
            csvBase64: csvBuffer.toString('base64'),
            metaText,
            themeMode: getThemeMode(),
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

        case 'openSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'metatext.');
          break;

        case 'updateConfig': {
          const patch = message.patch as Record<string, unknown> | undefined;
          if (patch && typeof patch === 'object') {
            const cfg = vscode.workspace.getConfiguration('metatext');
            const allowedKeys = [
              'defaultFontSize',
              'defaultRowHeight',
              'defaultMarkerColor',
              'showRowNumbers',
              'noHeaderColumnStyle',
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
            await fs.writeFile(csvPath, buf);
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
            await fs.writeFile(metaPath, String(message.metaText ?? ''), 'utf-8');
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
  return {
    defaultFontSize: cfg.get<number>('defaultFontSize', 13),
    defaultRowHeight: cfg.get<number>('defaultRowHeight', 28),
    defaultMarkerColor,
    showRowNumbers: cfg.get<boolean>('showRowNumbers', true),
    noHeaderColumnStyle,
  };
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
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MetaTextEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('metatext.selectZoom', async () => {
      await provider.promptZoomSelection();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('metatext.openWithEditor', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        void vscode.window.showWarningMessage('MetaText Editor: No file selected.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', targetUri, MetaTextEditorProvider.viewType);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}

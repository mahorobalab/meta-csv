import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

class MetaCsvDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}

  dispose(): void {
    // Nothing to dispose
  }
}

class MetaCsvEditorProvider implements vscode.CustomReadonlyEditorProvider<MetaCsvDocument> {
  public static readonly viewType = 'metaCsv.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri): Promise<MetaCsvDocument> {
    return new MetaCsvDocument(uri);
  }

  async resolveCustomEditor(
    document: MetaCsvDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');

    webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot],
    };

    webview.html = this.getHtmlForWebview(webview, webviewRoot);

    const csvPath = document.uri.fsPath;
    const metaPath = `${csvPath}.meta.jsonc`;

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

        case 'saveCsv': {
          try {
            const buf = Buffer.from(String(message.csvBase64 ?? ''), 'base64');
            await fs.writeFile(csvPath, buf);
            await webview.postMessage({ type: 'saved', target: 'csv', requestId: message.requestId });
          } catch (err) {
            void vscode.window.showErrorMessage(`MetaCSV: Failed to save CSV: ${String(err)}`);
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
            void vscode.window.showErrorMessage(`MetaCSV: Failed to save .meta.jsonc: ${String(err)}`);
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

    const themeDisposable = vscode.window.onDidChangeActiveColorTheme(() => {
      void webview.postMessage({
        type: 'themeChanged',
        themeMode: getThemeMode(),
      });
    });

    webviewPanel.onDidDispose(() => {
      msgDisposable.dispose();
      themeDisposable.dispose();
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
    <title>MetaCSV</title>
  </head>
  <body style="margin:0;padding:0;overflow:hidden;width:100vw;height:100vh;">
    <div id="root" style="width:100%;height:100%;"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
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
  const provider = new MetaCsvEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MetaCsvEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('metaCsv.openWithEditor', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        void vscode.window.showWarningMessage('MetaCSV: No CSV file selected.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', targetUri, MetaCsvEditorProvider.viewType);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up
}

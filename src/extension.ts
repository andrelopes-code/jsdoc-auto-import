import * as vscode from 'vscode';
import { ConfigResolver } from './config-resolver';
import { ImportBlockManager } from './import-block';
import { TypeIndex } from './type-index';
import { JsdocCodeActionProvider } from './code-action-provider';
import { JsdocCompletionProvider } from './completion-provider';
import { organizeImports } from './organize-imports';
import { convertAllImports } from './convert-imports';
import { InlineImportInterceptor } from './inline-import-interceptor';

const outputChannel = vscode.window.createOutputChannel('JSDoc Auto Import');

function log(msg: string): void {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

export async function activate(context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;

    const configResolver = new ConfigResolver(workspaceRoot, log);
    await configResolver.initialize();

    const typeIndex = new TypeIndex(workspaceRoot);
    // Do not await initialize here so we don't block extension activation.
    // The workspace scan can take a long time on large projects.
    typeIndex.initialize().catch(console.error);

    const importManager = new ImportBlockManager();

    const jsSelector: vscode.DocumentSelector = [
        { language: 'javascript', scheme: 'file' },
        { language: 'javascriptreact', scheme: 'file' },
    ];

    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
        jsSelector,
        new JsdocCodeActionProvider(importManager, typeIndex, configResolver),
        { providedCodeActionKinds: JsdocCodeActionProvider.providedCodeActionKinds },
    );

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        jsSelector,
        new JsdocCompletionProvider(importManager, typeIndex, configResolver),
        '{',
        ' ',
    );

    const organizeCommand = vscode.commands.registerCommand(
        'jsdoc-auto-import.organizeImports',
        organizeImports,
    );

    const convertCommand = vscode.commands.registerCommand(
        'jsdoc-auto-import.convertAllImports',
        convertAllImports,
    );

    const interceptor = new InlineImportInterceptor(importManager, log);
    const interceptorDisposable = interceptor.register();

    configResolver.onConfigChanged(() => {
        typeIndex.initialize().catch(console.error);
    });

    context.subscriptions.push(
        codeActionProvider,
        completionProvider,
        organizeCommand,
        convertCommand,
        interceptorDisposable,
        { dispose: () => configResolver.dispose() },
        { dispose: () => typeIndex.dispose() },
        { dispose: () => interceptor.dispose() },
        outputChannel,
    );
}

export function deactivate() {}

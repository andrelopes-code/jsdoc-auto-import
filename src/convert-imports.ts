import * as vscode from 'vscode';
import { ImportBlockManager } from './import-block';

const INLINE_IMPORT_REGEX = /import\(\s*['"]([^'"]+)['"]\s*\)\.(\w+)/g;

export async function convertAllImports(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const importManager = new ImportBlockManager();
    const edit = new vscode.WorkspaceEdit();

    const importsToAdd: { typeName: string; modulePath: string }[] = [];
    let matchFound = false;

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        let match: RegExpExecArray | null;
        const regex = new RegExp(INLINE_IMPORT_REGEX.source, 'g');

        while ((match = regex.exec(lineText)) !== null) {
            matchFound = true;
            const modulePath = match[1];
            const typeName = match[2];
            const fullMatch = match[0];
            const startCol = match.index;

            const inlineRange = new vscode.Range(i, startCol, i, startCol + fullMatch.length);

            // Replaces import('...').Type with Type
            edit.replace(document.uri, inlineRange, typeName);
            importsToAdd.push({ typeName, modulePath });
        }
    }

    if (!matchFound) {
        vscode.window.showInformationMessage('No inline imports found to convert.');
        return;
    }

    // Determine what to add and replace the entire block at once
    const importEdits = importManager.addImportsToBlock(document, importsToAdd);
    for (const te of importEdits) {
        edit.replace(document.uri, te.range, te.newText);
    }

    await vscode.workspace.applyEdit(edit);
    vscode.window.showInformationMessage(
        `Converted ${importsToAdd.length} inline import(s) to @import blocks.`,
    );
}

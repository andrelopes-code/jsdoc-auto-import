import * as vscode from 'vscode';
import { ImportBlockManager, ImportEntry } from './import-block';

export async function organizeImports(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    const manager = new ImportBlockManager();
    const existing = manager.getExistingImports(document);

    if (existing.length === 0) {
        vscode.window.showInformationMessage('No JSDoc @import blocks found.');
        return;
    }

    const importedTypes = new Set<string>();
    for (const entry of existing) {
        for (const t of entry.types) {
            importedTypes.add(t);
        }
    }

    const merged = mergeImports(existing);
    const usedTypes = findUsedTypes(
        document,
        manager.findInsertionStrategy(document).line,
        importedTypes,
    );
    const cleaned = removeUnusedTypes(merged, usedTypes);
    const sorted = sortImports(cleaned);

    let firstLine = existing[0].range.start.line;
    let lastLine = existing[existing.length - 1].range.end.line;

    if (firstLine > 0 && document.lineAt(firstLine - 1).text.trim() === '/**') {
        firstLine--;
    }
    if (lastLine < document.lineCount - 1 && document.lineAt(lastLine + 1).text.trim() === '*/') {
        lastLine++;
    }

    const fullRange = new vscode.Range(
        firstLine,
        0,
        lastLine,
        document.lineAt(lastLine).text.length,
    );

    const newText =
        sorted.length > 0
            ? '/**\n' +
              sorted
                  .map(
                      (entry) =>
                          ` * @import { ${entry.types.join(', ')} } from '${entry.modulePath}'`,
                  )
                  .join('\n') +
              '\n */'
            : '';

    await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, newText);
    });

    const removedCount = countTypes(existing) - countTypes(sorted);
    if (removedCount > 0) {
        vscode.window.showInformationMessage(
            `Organized JSDoc imports. Removed ${removedCount} unused type(s).`,
        );
    } else {
        vscode.window.showInformationMessage('JSDoc imports organized.');
    }
}

function mergeImports(entries: ImportEntry[]): ImportEntry[] {
    const byModule = new Map<string, Set<string>>();

    for (const entry of entries) {
        const existing = byModule.get(entry.modulePath) || new Set();
        for (const t of entry.types) {
            existing.add(t);
        }
        byModule.set(entry.modulePath, existing);
    }

    return Array.from(byModule.entries()).map(([modulePath, types]) => ({
        modulePath,
        types: Array.from(types),
        range: entries.find((e) => e.modulePath === modulePath)!.range,
    }));
}

function findUsedTypes(
    document: vscode.TextDocument,
    importEndLine: number,
    importedTypes: Set<string>,
): Set<string> {
    const used = new Set<string>();
    let inJsDoc = false;

    for (let i = importEndLine; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;

        if (/\/\*\*/.test(line)) {
            inJsDoc = true;
        }

        if (inJsDoc) {
            for (const type of importedTypes) {
                if (!used.has(type)) {
                    // Use word boundaries to match the exact type name
                    const regex = new RegExp(`\\b${type}\\b`);
                    if (regex.test(line)) {
                        used.add(type);
                    }
                }
            }
        }

        if (inJsDoc && /\*\//.test(line)) {
            inJsDoc = false;
        }

        // Optimization: if we found all imported types, stop scanning early
        if (used.size === importedTypes.size) {
            break;
        }
    }

    return used;
}

function removeUnusedTypes(entries: ImportEntry[], usedTypes: Set<string>): ImportEntry[] {
    return entries
        .map((entry) => ({
            ...entry,
            types: entry.types.filter((t) => usedTypes.has(t)),
        }))
        .filter((entry) => entry.types.length > 0);
}

function sortImports(entries: ImportEntry[]): ImportEntry[] {
    return entries
        .map((entry) => ({
            ...entry,
            types: [...entry.types].sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.modulePath.localeCompare(b.modulePath));
}

function countTypes(entries: ImportEntry[]): number {
    return entries.reduce((sum, e) => sum + e.types.length, 0);
}

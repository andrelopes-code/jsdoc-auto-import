import * as vscode from 'vscode';
import { ImportBlockManager } from './import-block';

const INLINE_IMPORT_REGEX = /import\(\s*['"]([^'"]+)['"]\s*\)\.(\w+)/g;

export class InlineImportInterceptor {
    private debounceTimer: NodeJS.Timeout | null = null;
    private isApplyingEdit = false;

    constructor(
        private importManager: ImportBlockManager,
        private log: (msg: string) => void,
    ) {}

    register(): vscode.Disposable {
        return vscode.workspace.onDidChangeTextDocument((event) => {
            if (this.isApplyingEdit) {
                return;
            }

            const isEnabled = vscode.workspace
                .getConfiguration('jsdocImport')
                .get<boolean>('autoConvertInlineImports', false);

            if (!isEnabled) {
                return;
            }

            const doc = event.document;
            if (doc.languageId !== 'javascript' && doc.languageId !== 'javascriptreact') {
                return;
            }

            if (event.contentChanges.length === 0) {
                return;
            }

            const changes = event.contentChanges;

            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                this.processDocument(doc, changes).catch((err) => {
                    this.log(`Interceptor Error: ${err}`);
                });
            }, 300);
        });
    }

    private async processDocument(
        document: vscode.TextDocument,
        changes: readonly vscode.TextDocumentContentChangeEvent[],
    ): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
            return;
        }

        const importsToAdd: { typeName: string; modulePath: string; range: vscode.Range }[] = [];

        // Determine which lines were affected by the changes
        const linesToScan = new Set<number>();
        for (const change of changes) {
            const startLine = change.range.start.line;
            // Calculate how many lines the new text spans
            const lineCount = change.text.split('\n').length;
            for (let i = 0; i < lineCount; i++) {
                if (startLine + i < document.lineCount) {
                    linesToScan.add(startLine + i);
                }
            }
        }

        // Only scan the modified lines
        for (const i of linesToScan) {
            const lineText = document.lineAt(i).text;
            if (!lineText.includes('import(')) continue;

            const regex = new RegExp(INLINE_IMPORT_REGEX.source, 'g');
            let match: RegExpExecArray | null;

            while ((match = regex.exec(lineText)) !== null) {
                const modulePath = match[1];
                const typeName = match[2];
                const fullMatch = match[0];
                const startCol = match.index;

                const range = new vscode.Range(i, startCol, i, startCol + fullMatch.length);
                importsToAdd.push({ typeName, modulePath, range });
            }
        }

        if (importsToAdd.length === 0) {
            return;
        }

        this.log(`Interceptor: found ${importsToAdd.length} inline import(s) to auto-convert`);
        this.isApplyingEdit = true;

        try {
            const edit = new vscode.WorkspaceEdit();

            // 1. Replace all occurrences of import('...').Type with just Type
            for (const item of importsToAdd) {
                this.log(`  Auto-converting: import('${item.modulePath}').${item.typeName}`);
                edit.replace(document.uri, item.range, item.typeName);
            }

            // 2. Generate the single consolidated block edit at the top of the file
            const newImports = importsToAdd.map(({ typeName, modulePath }) => ({
                typeName,
                modulePath,
            }));
            
            const blockEdits = this.importManager.addImportsToBlock(document, newImports);
            for (const te of blockEdits) {
                edit.replace(document.uri, te.range, te.newText);
            }

            await vscode.workspace.applyEdit(edit);
            this.log(`Interceptor: successfully converted ${importsToAdd.length} import(s)`);
        } finally {
            setTimeout(() => {
                this.isApplyingEdit = false;
            }, 100);
        }
    }

    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
}

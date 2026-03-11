import * as vscode from 'vscode';

export interface ImportEntry {
    types: string[];
    modulePath: string;
    range: vscode.Range;
}

const SINGLE_LINE_IMPORT = /^\/\*\*\s*@import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*\*\//;
const MULTI_LINE_IMPORT = /^[ \t]*\*[ \t]*@import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/;

const JS_DOC_START = /^\/\*\*/;
const JS_DOC_END = /\*\//;

const SKIP_LINE_PATTERNS = [
    /^#!/, // shebang
    /^\s*['"]use strict['"];?\s*$/,
    /^\s*\/\/\s*@ts-check\s*$/,
    /^\s*\/\/\s*@ts-nocheck\s*$/,
    /^\s*$/,
];

export class ImportBlockManager {
    getExistingImports(document: vscode.TextDocument): ImportEntry[] {
        const imports: ImportEntry[] = [];
        let inBlock = false;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;

            if (SINGLE_LINE_IMPORT.test(line)) {
                const match = SINGLE_LINE_IMPORT.exec(line)!;
                this.addImportEntry(imports, match, i, line);
                continue;
            }

            if (!inBlock && JS_DOC_START.test(line)) {
                inBlock = true;
                if (JS_DOC_END.test(line.substring(3))) {
                    inBlock = false;
                }
                continue;
            }

            if (inBlock) {
                if (MULTI_LINE_IMPORT.test(line)) {
                    const match = MULTI_LINE_IMPORT.exec(line)!;
                    this.addImportEntry(imports, match, i, line);
                }

                if (JS_DOC_END.test(line)) {
                    inBlock = false;
                }
                continue;
            }

            if (!this.isSkippableLine(line)) {
                break;
            }
        }

        return imports;
    }

    private addImportEntry(
        imports: ImportEntry[],
        match: RegExpExecArray,
        lineNum: number,
        lineText: string,
    ) {
        const types = match[1]
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        imports.push({
            types,
            modulePath: match[2],
            range: new vscode.Range(lineNum, 0, lineNum, lineText.length),
        });
    }

    findInsertionStrategy(
        document: vscode.TextDocument,
    ): { kind: 'create' | 'appendToBlock'; line: number } {
        let lastImportLine = -1;
        let inBlock = false;
        let blockHasImport = false;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;

            if (SINGLE_LINE_IMPORT.test(line)) {
                lastImportLine = i;
                continue;
            }

            if (!inBlock && JS_DOC_START.test(line)) {
                inBlock = true;
                blockHasImport = false;
                if (JS_DOC_END.test(line.substring(3))) {
                    inBlock = false;
                }
                continue;
            }

            if (inBlock) {
                if (MULTI_LINE_IMPORT.test(line)) {
                    blockHasImport = true;
                }

                if (JS_DOC_END.test(line)) {
                    if (blockHasImport) {
                        return { kind: 'appendToBlock', line: i };
                    }
                    inBlock = false;
                }
                continue;
            }

            if (!this.isSkippableLine(line)) {
                if (lastImportLine !== -1) {
                    return { kind: 'create', line: lastImportLine + 1 };
                }

                return { kind: 'create', line: i };
            }
        }

        if (lastImportLine !== -1) {
            return { kind: 'create', line: lastImportLine + 1 };
        }

        return { kind: 'create', line: document.lineCount };
    }

    createAddImportEdit(
        document: vscode.TextDocument,
        typeName: string,
        modulePath: string,
    ): vscode.TextEdit[] {
        return this.addImportsToBlock(document, [{ typeName, modulePath }]);
    }

    addImportsToBlock(
        document: vscode.TextDocument,
        newImports: { typeName: string; modulePath: string }[],
    ): vscode.TextEdit[] {
        if (newImports.length === 0) {
            return [];
        }

        const existing = this.getExistingImports(document);
        
        // Merge existing and new imports
        const byModule = new Map<string, Set<string>>();
        for (const entry of existing) {
            const types = byModule.get(entry.modulePath) || new Set();
            for (const t of entry.types) types.add(t);
            byModule.set(entry.modulePath, types);
        }

        for (const newImport of newImports) {
            const types = byModule.get(newImport.modulePath) || new Set();
            types.add(newImport.typeName);
            byModule.set(newImport.modulePath, types);
        }

        const sorted = Array.from(byModule.entries())
            .map(([modulePath, typesSet]) => ({
                modulePath,
                types: Array.from(typesSet).sort((a, b) => a.localeCompare(b)),
            }))
            .sort((a, b) => a.modulePath.localeCompare(b.modulePath));

        const blockText =
            '/**\n' +
            sorted
                .map((entry) => ` * @import { ${entry.types.join(', ')} } from '${entry.modulePath}'`)
                .join('\n') +
            '\n */';

        if (existing.length > 0) {
            let firstLine = existing[0].range.start.line;
            let lastLine = existing[existing.length - 1].range.end.line;

            if (firstLine > 0 && document.lineAt(firstLine - 1).text.trim() === '/**') {
                firstLine--;
            }
            if (lastLine < document.lineCount - 1 && document.lineAt(lastLine + 1).text.trim() === '*/') {
                lastLine++;
            }

            const range = new vscode.Range(
                firstLine,
                0,
                lastLine,
                document.lineAt(lastLine).text.length,
            );
            return [vscode.TextEdit.replace(range, blockText)];
        } else {
            const strategy = this.findInsertionStrategy(document);
            const needsTrailingBlank = this.needsBlankLineAfter(document, strategy.line);
            
            return [
                vscode.TextEdit.insert(
                    new vscode.Position(strategy.line, 0),
                    blockText + '\n' + (needsTrailingBlank ? '\n' : '')
                )
            ];
        }
    }

    private needsBlankLineAfter(document: vscode.TextDocument, insertLine: number): boolean {
        if (insertLine >= document.lineCount) {
            return false;
        }
        const nextLine = document.lineAt(insertLine).text;
        if (nextLine.trim() === '') {
            return false;
        }
        if (JS_DOC_START.test(nextLine) || SINGLE_LINE_IMPORT.test(nextLine)) {
            return false;
        }
        return true;
    }

    private isSkippableLine(line: string): boolean {
        return SKIP_LINE_PATTERNS.some((pattern) => pattern.test(line));
    }
}

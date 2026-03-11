import * as vscode from 'vscode';
import * as path from 'path';
import * as ts from 'typescript';
import * as fs from 'fs';

export interface TypeSource {
    name: string;
    filePath: string;
    kind: 'type' | 'interface' | 'class' | 'enum' | 'typedef';
}

export class TypeIndex {
    private index = new Map<string, TypeSource[]>();
    private watcher: vscode.FileSystemWatcher | null = null;
    private excludePatterns: string[] = [];

    constructor(private workspaceRoot: string) {}

    async initialize(): Promise<void> {
        this.excludePatterns = vscode.workspace
            .getConfiguration('jsdocImport')
            .get<string[]>('exclude', ['**/node_modules/**', '**/dist/**', '**/out/**']);

        await this.scanWorkspace();
        this.setupWatcher();
    }

    private async scanWorkspace(): Promise<void> {
        this.index.clear();

        const dtsFiles = await vscode.workspace.findFiles(
            '**/*.d.ts',
            `{${this.excludePatterns.join(',')}}`,
        );
        const jsFiles = await vscode.workspace.findFiles(
            '**/*.js',
            `{${this.excludePatterns.join(',')}}`,
        );

        const allFiles = [
            ...dtsFiles.map((uri) => ({ path: uri.fsPath, type: 'dts' as const })),
            ...jsFiles.map((uri) => ({ path: uri.fsPath, type: 'js' as const })),
        ];

        // Process in chunks to avoid blocking the event loop and OOM issues
        const chunkSize = 50;
        for (let i = 0; i < allFiles.length; i += chunkSize) {
            const chunk = allFiles.slice(i, i + chunkSize);
            await Promise.all(
                chunk.map(async (file) => {
                    if (file.type === 'dts') {
                        await this.indexDtsFile(file.path);
                    } else {
                        await this.indexJsFile(file.path);
                    }
                }),
            );

            // Yield the event loop to prevent extension host unresponsiveness
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    private async indexDtsFile(filePath: string): Promise<void> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

            ts.forEachChild(sourceFile, (node) => {
                if (!this.isExported(node)) {
                    return;
                }

                let name: string | undefined;
                let kind: TypeSource['kind'] | undefined;

                if (ts.isTypeAliasDeclaration(node)) {
                    name = node.name.text;
                    kind = 'type';
                } else if (ts.isInterfaceDeclaration(node)) {
                    name = node.name.text;
                    kind = 'interface';
                } else if (ts.isClassDeclaration(node) && node.name) {
                    name = node.name.text;
                    kind = 'class';
                } else if (ts.isEnumDeclaration(node)) {
                    name = node.name.text;
                    kind = 'enum';
                }

                if (name && kind) {
                    this.addToIndex(name, filePath, kind);
                }
            });
        } catch {
            // skip unreadable files
        }
    }

    private async indexJsFile(filePath: string): Promise<void> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const typedefRegex = /@typedef\s*\{[^}]*\}\s*(\w+)/g;
            let match: RegExpExecArray | null;

            while ((match = typedefRegex.exec(content)) !== null) {
                this.addToIndex(match[1], filePath, 'typedef');
            }
        } catch {
            // skip unreadable files
        }
    }

    private isExported(node: ts.Node): boolean {
        if (!ts.canHaveModifiers(node)) {
            return false;
        }
        const modifiers = ts.getModifiers(node);
        if (!modifiers) {
            return false;
        }
        return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    }

    private addToIndex(name: string, filePath: string, kind: TypeSource['kind']): void {
        const existing = this.index.get(name) || [];
        const alreadyExists = existing.some((e) => e.filePath === filePath && e.kind === kind);
        if (!alreadyExists) {
            existing.push({ name, filePath, kind });
            this.index.set(name, existing);
        }
    }

    private setupWatcher(): void {
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.workspaceRoot, '**/*.{d.ts,js}'),
        );

        this.watcher.onDidChange((uri) => this.reindexFile(uri.fsPath).catch(console.error));
        this.watcher.onDidCreate((uri) => this.reindexFile(uri.fsPath).catch(console.error));
        this.watcher.onDidDelete((uri) => this.removeFile(uri.fsPath));
    }

    private async reindexFile(filePath: string): Promise<void> {
        if (this.isExcluded(filePath)) {
            return;
        }
        this.removeFile(filePath);
        if (filePath.endsWith('.d.ts')) {
            await this.indexDtsFile(filePath);
        } else if (filePath.endsWith('.js')) {
            await this.indexJsFile(filePath);
        }
    }

    private removeFile(filePath: string): void {
        for (const [name, sources] of this.index.entries()) {
            const filtered = sources.filter((s) => s.filePath !== filePath);
            if (filtered.length === 0) {
                this.index.delete(name);
            } else {
                this.index.set(name, filtered);
            }
        }
    }

    private isExcluded(filePath: string): boolean {
        const relative = path.relative(this.workspaceRoot, filePath);
        return this.excludePatterns.some((pattern) => {
            const simplePattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
            return relative.includes(simplePattern.replace(/\//g, path.sep));
        });
    }

    findType(name: string): TypeSource[] {
        return this.index.get(name) || [];
    }

    getAllTypeNames(): string[] {
        return Array.from(this.index.keys());
    }

    dispose(): void {
        this.watcher?.dispose();
    }
}

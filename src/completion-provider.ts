import * as vscode from 'vscode';
import { ImportBlockManager } from './import-block';
import { TypeIndex } from './type-index';
import { ConfigResolver } from './config-resolver';

export class JsdocCompletionProvider implements vscode.CompletionItemProvider {
    constructor(
        private importManager: ImportBlockManager,
        private typeIndex: TypeIndex,
        private configResolver: ConfigResolver,
    ) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] | undefined {
        if (!this.isInsideJsdocTypePosition(document, position)) {
            return undefined;
        }

        const existingImports = this.importManager.getExistingImports(document);
        const importedTypes = new Set(existingImports.flatMap((e) => e.types));

        const allTypes = this.typeIndex.getAllTypeNames();
        const items: vscode.CompletionItem[] = [];

        for (const typeName of allTypes) {
            const sources = this.typeIndex.findType(typeName);
            if (sources.length === 0) {
                continue;
            }

            const alreadyImported = importedTypes.has(typeName);

            for (const source of sources) {
                const importPath = this.configResolver.resolveImportPath(
                    document.uri.fsPath,
                    source.filePath,
                );

                const item = new vscode.CompletionItem(
                    {
                        label: typeName,
                        description: `[JSDoc Import] ${source.kind} from '${importPath}'`,
                    },
                    vscode.CompletionItemKind.TypeParameter,
                );

                item.detail = `@import { ${typeName} } from '${importPath}'`;
                item.documentation = new vscode.MarkdownString(
                    `**JSDoc Auto Import**\n\nAdds \`/** @import { ${typeName} } from '${importPath}' */\`\nat the top of the file.`,
                );

                if (alreadyImported) {
                    item.sortText = `! _${typeName}`;
                    item.detail += ' (already imported)';
                } else {
                    item.sortText = `!!_${typeName}`;
                    item.preselect = true;
                    const edits = this.importManager.createAddImportEdit(
                        document,
                        typeName,
                        importPath,
                    );
                    item.additionalTextEdits = edits;
                }

                items.push(item);
            }
        }

        return items;
    }

    private isInsideJsdocTypePosition(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): boolean {
        const line = document.lineAt(position.line).text;
        const textBefore = line.substring(0, position.character);

        const jsdocTypeContexts = [
            /@type\s*\{\s*$/,
            /@type\s*\{[^}]*$/,
            /@param\s*\{[^}]*$/,
            /@returns?\s*\{[^}]*$/,
            /@typedef\s*\{[^}]*$/,
            /@template\s+\w*$/,
        ];

        return jsdocTypeContexts.some((pattern) => pattern.test(textBefore));
    }
}

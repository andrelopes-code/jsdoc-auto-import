import * as vscode from 'vscode';
import { ImportBlockManager } from './import-block';
import { TypeIndex } from './type-index';
import { ConfigResolver } from './config-resolver';

const JSDOC_TYPE_REF_REGEX = /@(?:type|param|returns?|typedef)\s*\{([^}]+)\}/g;
const INLINE_IMPORT_REGEX = /import\(\s*['"]([^'"]+)['"]\s*\)\.(\w+)/g;
const SIMPLE_TYPE_NAME = /^[A-Z]\w*$/;

export class JsdocCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(
        private importManager: ImportBlockManager,
        private typeIndex: TypeIndex,
        private configResolver: ConfigResolver,
    ) {}

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        _context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        const lineText = document.lineAt(range.start.line).text;

        this.addMissingTypeActions(document, lineText, actions);
        this.addInlineImportConversionActions(document, lineText, range.start.line, actions);

        return actions;
    }

    private addMissingTypeActions(
        document: vscode.TextDocument,
        lineText: string,
        actions: vscode.CodeAction[],
    ): void {
        const existingImports = this.importManager.getExistingImports(document);
        const importedTypes = new Set(existingImports.flatMap((e) => e.types));

        let match: RegExpExecArray | null;
        const regex = new RegExp(JSDOC_TYPE_REF_REGEX.source, 'g');

        while ((match = regex.exec(lineText)) !== null) {
            const typeContent = match[1].trim();
            const typeNames = this.extractTypeNames(typeContent);

            for (const typeName of typeNames) {
                if (importedTypes.has(typeName)) {
                    continue;
                }

                const sources = this.typeIndex.findType(typeName);
                for (const source of sources) {
                    const importPath = this.configResolver.resolveImportPath(
                        document.uri.fsPath,
                        source.filePath,
                    );

                    const action = new vscode.CodeAction(
                        `Add JSDoc @import for '${typeName}' from '${importPath}'`,
                        vscode.CodeActionKind.QuickFix,
                    );

                    const edit = new vscode.WorkspaceEdit();
                    const textEdits = this.importManager.createAddImportEdit(
                        document,
                        typeName,
                        importPath,
                    );
                    for (const te of textEdits) {
                        edit.replace(document.uri, te.range, te.newText);
                    }
                    action.edit = edit;
                    action.isPreferred = sources.length === 1;
                    actions.push(action);
                }
            }
        }
    }

    private addInlineImportConversionActions(
        document: vscode.TextDocument,
        lineText: string,
        lineNumber: number,
        actions: vscode.CodeAction[],
    ): void {
        let match: RegExpExecArray | null;
        const regex = new RegExp(INLINE_IMPORT_REGEX.source, 'g');

        while ((match = regex.exec(lineText)) !== null) {
            const modulePath = match[1];
            const typeName = match[2];
            const fullMatch = match[0];
            const startCol = match.index;

            const action = new vscode.CodeAction(
                `Convert inline import to @import for '${typeName}'`,
                vscode.CodeActionKind.QuickFix,
            );

            const edit = new vscode.WorkspaceEdit();

            const importEdits = this.importManager.createAddImportEdit(
                document,
                typeName,
                modulePath,
            );
            for (const te of importEdits) {
                edit.replace(document.uri, te.range, te.newText);
            }

            const inlineRange = new vscode.Range(
                lineNumber,
                startCol,
                lineNumber,
                startCol + fullMatch.length,
            );
            edit.replace(document.uri, inlineRange, typeName);

            action.edit = edit;
            action.isPreferred = true;
            actions.push(action);
        }
    }

    private extractTypeNames(typeContent: string): string[] {
        const names: string[] = [];
        const cleaned = typeContent
            .replace(/import\([^)]+\)\.\w+/g, '')
            .replace(/[<>\[\]|&()?,]/g, ' ');

        for (const token of cleaned.split(/\s+/)) {
            const trimmed = token.trim();
            if (SIMPLE_TYPE_NAME.test(trimmed) && !this.isBuiltinType(trimmed)) {
                names.push(trimmed);
            }
        }
        return names;
    }

    private isBuiltinType(name: string): boolean {
        const builtins = new Set([
            'String',
            'Number',
            'Boolean',
            'Object',
            'Array',
            'Function',
            'Symbol',
            'BigInt',
            'Promise',
            'Map',
            'Set',
            'WeakMap',
            'WeakSet',
            'Date',
            'RegExp',
            'Error',
            'TypeError',
            'RangeError',
            'SyntaxError',
            'Proxy',
            'Reflect',
            'JSON',
            'Math',
            'Intl',
            'ArrayBuffer',
            'DataView',
            'Float32Array',
            'Float64Array',
            'Int8Array',
            'Int16Array',
            'Int32Array',
            'Uint8Array',
            'Uint16Array',
            'Uint32Array',
            'Uint8ClampedArray',
            'SharedArrayBuffer',
            'Atomics',
            'Iterator',
            'Generator',
            'GeneratorFunction',
            'AsyncGenerator',
            'AsyncGeneratorFunction',
            'AsyncFunction',
            'AsyncIterator',
            'Record',
            'Partial',
            'Required',
            'Readonly',
            'Pick',
            'Omit',
            'Exclude',
            'Extract',
            'NonNullable',
            'ReturnType',
            'InstanceType',
            'Parameters',
            'ConstructorParameters',
            'ThisParameterType',
            'OmitThisParameter',
            'ThisType',
            'Awaited',
            'HTMLElement',
            'Element',
            'Node',
            'Document',
            'Window',
            'Event',
            'Void',
            'Null',
            'Undefined',
            'Never',
            'Any',
            'Unknown',
        ]);
        return builtins.has(name);
    }
}

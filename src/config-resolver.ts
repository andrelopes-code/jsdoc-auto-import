import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface PathMapping {
    alias: string;
    paths: string[];
}

interface ResolvedConfig {
    baseUrl: string;
    pathMappings: PathMapping[];
    rootDir: string;
}

export class ConfigResolver {
    private configCache = new Map<string, ResolvedConfig | null>();
    private configWatcher: vscode.FileSystemWatcher | null = null;
    private onConfigChangedEmitter = new vscode.EventEmitter<void>();
    readonly onConfigChanged = this.onConfigChangedEmitter.event;

    constructor(
        private workspaceRoot: string,
        private log: (msg: string) => void
    ) {}

    async initialize(): Promise<void> {
        this.setupWatcher();
    }

    private setupWatcher(): void {
        const pattern = new vscode.RelativePattern(
            this.workspaceRoot,
            '**/{jsconfig.json,tsconfig.json}',
        );
        this.configWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const reload = async () => {
            this.log('Config file changed, clearing resolution cache...');
            this.configCache.clear();
            this.onConfigChangedEmitter.fire();
        };

        this.configWatcher.onDidChange(reload);
        this.configWatcher.onDidCreate(reload);
        this.configWatcher.onDidDelete(reload);
    }

    private findClosestConfig(startPath: string): ResolvedConfig | null {
        let currentDir = path.dirname(startPath);
        
        while (currentDir.startsWith(this.workspaceRoot) || currentDir.toLowerCase().startsWith(this.workspaceRoot.toLowerCase())) {
            // Check cache
            const normalizedDir = Object.keys(Object.fromEntries(this.configCache)).find(
                k => k.toLowerCase() === currentDir.toLowerCase()
            ) || currentDir;

            if (this.configCache.has(normalizedDir)) {
                return this.configCache.get(normalizedDir)!;
            }

            const candidates = ['jsconfig.json', 'tsconfig.json'];
            for (const candidate of candidates) {
                const configPath = path.join(currentDir, candidate);
                if (fs.existsSync(configPath)) {
                    this.log(`Found config file: ${configPath} for ${startPath}`);
                    const config = this.parseConfig(configPath);
                    this.configCache.set(normalizedDir, config);
                    return config;
                }
            }

            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
        }

        this.configCache.set(path.dirname(startPath), null);
        return null;
    }

    private parseConfig(configPath: string): ResolvedConfig | null {
        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            // Remove comments (basic regex for JSONC, not perfect but usually enough for tsconfig)
            const cleanedRaw = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            const json = JSON.parse(cleanedRaw);
            
            const compilerOptions = json.compilerOptions || {};
            const baseUrl = compilerOptions.baseUrl || '.';
            const paths = compilerOptions.paths || {};

            const pathMappings: PathMapping[] = Object.entries(paths).map(([alias, targets]) => ({
                alias: alias.replace(/\/\*$/, ''),
                paths: (targets as string[]).map((t) => t.replace(/\/\*$/, '')),
            }));

            return {
                baseUrl: path.resolve(path.dirname(configPath), baseUrl),
                pathMappings,
                rootDir: path.dirname(configPath),
            };
        } catch (err) {
            this.log(`Error parsing config ${configPath}: ${err}`);
            return null;
        }
    }

    resolveImportPath(fromFile: string, toFile: string): string {
        const preferAbsolute = vscode.workspace
            .getConfiguration('jsdocImport')
            .get<boolean>('preferAbsolute', true);

        if (preferAbsolute) {
            let config = this.findClosestConfig(fromFile);
            
            // If the user specified a custom config file in settings, try to use it over the discovered one
            const extensionConfig = vscode.workspace.getConfiguration('jsdocImport');
            const customConfigPath = extensionConfig.get<string>('configFile', '');
            if (customConfigPath) {
                const absPath = path.isAbsolute(customConfigPath)
                    ? customConfigPath
                    : path.join(this.workspaceRoot, customConfigPath);
                if (fs.existsSync(absPath)) {
                    if (!this.configCache.has(absPath)) {
                        this.log(`Using custom config from settings: ${absPath}`);
                        this.configCache.set(absPath, this.parseConfig(absPath));
                    }
                    config = this.configCache.get(absPath) || null;
                }
            }

            if (config) {
                for (const mapping of config.pathMappings) {
                    for (const mappedPath of mapping.paths) {
                        const absoluteMapped = path.resolve(config.baseUrl, mappedPath);
                        const relative = path.relative(absoluteMapped, toFile);

                        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
                            const aliasPath = mapping.alias + '/' + relative.replace(/\\/g, '/');
                            const result = this.stripExtension(aliasPath);
                            this.log(`Resolved import using alias: ${result} from ${fromFile}`);
                            return result;
                        }
                    }
                }
            }
        }

        let relativePath = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/');
        if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }
        const result = this.stripExtension(relativePath);
        // this.log(`Resolved import using relative path: ${result} from ${fromFile}`);
        return result;
    }

    private stripExtension(filePath: string): string {
        return filePath.replace(/\.(ts|tsx|js|jsx|d\.ts)$/, '');
    }

    dispose(): void {
        this.configWatcher?.dispose();
        this.onConfigChangedEmitter.dispose();
    }
}

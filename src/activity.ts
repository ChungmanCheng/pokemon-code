import { createHash } from 'crypto';

export type ActivitySource = 'editor' | 'filesystem';
export interface ActivityBatch { files: number; sources: ActivitySource[]; }

export function fingerprint(content: string | Uint8Array): string {
    return createHash('sha256').update(content).digest('hex');
}

const excludedDirectories = new Set([
    '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
    '.cache', '.venv', 'venv', '__pycache__', 'vendor', 'target', '.codex', '.agents'
]);
const codeExtensions = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'py', 'pyi', 'rb', 'go',
    'rs', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'java', 'kt', 'kts', 'swift', 'm', 'mm',
    'php', 'vue', 'svelte', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'jsonc',
    'yaml', 'yml', 'toml', 'xml', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'md', 'mdx',
    'r', 'rmd', 'lua', 'ex', 'exs', 'erl', 'hrl', 'hs', 'scala', 'dart', 'ipynb',
    'graphql', 'gql', 'proto', 'tf', 'tfvars', 'ini', 'cfg', 'conf', 'txt', 'tex',
    'clj', 'cljs', 'cljc', 'edn', 'fs', 'fsx', 'vb', 'pl', 'pm', 'jl', 'zig', 'bat', 'cmd'
]);

export function isCodePath(filePath: string, extraExcluded: readonly string[] = []): boolean {
    const parts = filePath.replace(/\\/g, '/').split('/');
    if (parts.some(part => excludedDirectories.has(part) || extraExcluded.includes(part))) { return false; }
    const name = parts[parts.length - 1].toLowerCase();
    if (['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'composer.lock', 'yarn.lock', 'bun.lock', 'bun.lockb'].includes(name)
        || name.endsWith('.min.js') || name.endsWith('.min.css')) { return false; }
    return ['dockerfile', 'makefile', 'justfile', 'gemfile', 'rakefile', '.gitignore', '.editorconfig'].includes(name)
        || codeExtensions.has(name.slice(name.lastIndexOf('.') + 1));
}

/** Deduplicate editor/save/watcher events by content; merge a burst into one reward. */
export class ActivityBuffer {
    private readonly fingerprints = new Map<string, string>();
    private readonly pendingFiles = new Set<string>();
    private readonly pendingSources = new Set<ActivitySource>();

    seed(key: string, hash: string): void {
        if (!this.fingerprints.has(key)) { this.remember(key, hash); }
    }

    private remember(key: string, hash: string): void {
        this.fingerprints.delete(key);
        this.fingerprints.set(key, hash);
        if (this.fingerprints.size > 10000) {
            const oldest = this.fingerprints.keys().next().value;
            this.fingerprints.delete(oldest);
        }
    }

    observe(key: string, hash: string, source: ActivitySource): boolean {
        if (this.fingerprints.get(key) === hash) { return false; }
        this.remember(key, hash);
        this.pendingFiles.add(key);
        this.pendingSources.add(source);
        return true;
    }

    take(): ActivityBatch | undefined {
        if (!this.pendingFiles.size) { return undefined; }
        const batch = { files: this.pendingFiles.size, sources: [...this.pendingSources] };
        this.pendingFiles.clear();
        this.pendingSources.clear();
        return batch;
    }
}

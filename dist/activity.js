"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityBuffer = exports.isCodePath = exports.fingerprint = void 0;
const crypto_1 = require("crypto");
function fingerprint(content) {
    return (0, crypto_1.createHash)('sha256').update(content).digest('hex');
}
exports.fingerprint = fingerprint;
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
function isCodePath(filePath, extraExcluded = []) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    if (parts.some(part => excludedDirectories.has(part) || extraExcluded.includes(part))) {
        return false;
    }
    const name = parts[parts.length - 1].toLowerCase();
    if (['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'composer.lock', 'yarn.lock', 'bun.lock', 'bun.lockb'].includes(name)
        || name.endsWith('.min.js') || name.endsWith('.min.css')) {
        return false;
    }
    return ['dockerfile', 'makefile', 'justfile', 'gemfile', 'rakefile', '.gitignore', '.editorconfig'].includes(name)
        || codeExtensions.has(name.slice(name.lastIndexOf('.') + 1));
}
exports.isCodePath = isCodePath;
/** Deduplicate editor/save/watcher events by content; merge a burst into one reward. */
class ActivityBuffer {
    constructor() {
        this.fingerprints = new Map();
        this.pendingFiles = new Set();
        this.pendingSources = new Set();
    }
    seed(key, hash) {
        if (!this.fingerprints.has(key)) {
            this.remember(key, hash);
        }
    }
    remember(key, hash) {
        this.fingerprints.delete(key);
        this.fingerprints.set(key, hash);
        if (this.fingerprints.size > 10000) {
            const oldest = this.fingerprints.keys().next().value;
            this.fingerprints.delete(oldest);
        }
    }
    observe(key, hash, source) {
        if (this.fingerprints.get(key) === hash) {
            return false;
        }
        this.remember(key, hash);
        this.pendingFiles.add(key);
        this.pendingSources.add(source);
        return true;
    }
    take() {
        if (!this.pendingFiles.size) {
            return undefined;
        }
        const batch = { files: this.pendingFiles.size, sources: [...this.pendingSources] };
        this.pendingFiles.clear();
        this.pendingSources.clear();
        return batch;
    }
}
exports.ActivityBuffer = ActivityBuffer;
//# sourceMappingURL=activity.js.map
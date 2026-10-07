"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityTracker = void 0;
const vscode = __importStar(require("vscode"));
const activity_1 = require("./activity");
const maxFileSize = 1024 * 1024;
class ActivityTracker {
    constructor(options, onActivity) {
        this.options = options;
        this.onActivity = onActivity;
        this.buffer = new activity_1.ActivityBuffer();
        this.subscriptions = [];
        this.revisions = new Map();
        this.disposed = false;
        for (const document of vscode.workspace.textDocuments) {
            this.seed(document);
        }
        this.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => this.seed(document)), vscode.workspace.onDidChangeTextDocument(event => {
            if (!event.contentChanges.length || !this.options().enabled || !this.accepts(event.document.uri)) {
                return;
            }
            const key = event.document.uri.toString();
            this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
            this.observe(key, (0, activity_1.fingerprint)(event.document.getText()), 'editor');
        }));
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.subscriptions.push(watcher, watcher.onDidCreate(uri => { void this.readChange(uri); }), watcher.onDidChange(uri => { void this.readChange(uri); }), watcher.onDidDelete(uri => {
            if (!this.options().enabled || !this.options().trackExternalChanges || !this.accepts(uri)) {
                return;
            }
            const key = uri.toString();
            this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
            this.observe(key, 'deleted', 'filesystem');
        }));
    }
    accepts(uri) {
        if (uri.scheme === 'untitled') {
            return true;
        }
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        return !!folder && (0, activity_1.isCodePath)(uri.path.slice(folder.uri.path.length + 1), this.options().excludedDirectories);
    }
    seed(document) {
        if (this.accepts(document.uri)) {
            this.buffer.seed(document.uri.toString(), (0, activity_1.fingerprint)(document.getText()));
        }
    }
    observe(key, hash, source) {
        if (this.disposed || !this.buffer.observe(key, hash, source) || this.timer) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.flush();
        }, Math.max(500, this.options().activityCooldownMs));
    }
    async readChange(uri) {
        if (this.disposed || !this.options().enabled || !this.options().trackExternalChanges || !this.accepts(uri)) {
            return;
        }
        const key = uri.toString();
        const revision = (this.revisions.get(key) || 0) + 1;
        this.revisions.set(key, revision);
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (!(stat.type & vscode.FileType.File) || stat.size > maxFileSize) {
                return;
            }
            const content = await vscode.workspace.fs.readFile(uri);
            if (this.disposed || this.revisions.get(key) !== revision || !this.options().enabled || !this.options().trackExternalChanges) {
                return;
            }
            if (content.byteLength > maxFileSize || content.includes(0)) {
                return;
            }
            const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === key);
            if (document?.isDirty) {
                return;
            }
            this.observe(key, (0, activity_1.fingerprint)(content), 'filesystem');
        }
        catch {
            // Atomic file replacements can disappear briefly. The create event follows.
        }
    }
    flush() {
        const batch = this.buffer.take();
        if (batch && this.options().enabled) {
            this.onActivity(batch);
        }
    }
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.flush();
        this.subscriptions.forEach(subscription => subscription.dispose());
    }
}
exports.ActivityTracker = ActivityTracker;
//# sourceMappingURL=ActivityTracker.js.map
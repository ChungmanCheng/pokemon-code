import * as vscode from 'vscode';
import { ActivityBatch, ActivityBuffer, fingerprint, isCodePath } from './activity';

export interface TrackingOptions {
    enabled: boolean;
    trackExternalChanges: boolean;
    activityCooldownMs: number;
    excludedDirectories: string[];
}

const maxFileSize = 1024 * 1024;

export class ActivityTracker implements vscode.Disposable {
    private readonly buffer = new ActivityBuffer();
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly revisions = new Map<string, number>();
    private timer?: ReturnType<typeof setTimeout>;
    private disposed = false;

    constructor(
        private readonly options: () => TrackingOptions,
        private readonly onActivity: (batch: ActivityBatch) => void
    ) {
        for (const document of vscode.workspace.textDocuments) { this.seed(document); }
        this.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(document => this.seed(document)),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (!event.contentChanges.length || !this.options().enabled || !this.accepts(event.document.uri)) { return; }
                const key = event.document.uri.toString();
                this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
                this.observe(key, fingerprint(event.document.getText()), 'editor');
            })
        );
        const watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.subscriptions.push(watcher,
            watcher.onDidCreate(uri => { void this.readChange(uri); }),
            watcher.onDidChange(uri => { void this.readChange(uri); }),
            watcher.onDidDelete(uri => {
                if (!this.options().enabled || !this.options().trackExternalChanges || !this.accepts(uri)) { return; }
                const key = uri.toString();
                this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
                this.observe(key, 'deleted', 'filesystem');
            })
        );
    }

    private accepts(uri: vscode.Uri): boolean {
        if (uri.scheme === 'untitled') { return true; }
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        return !!folder && isCodePath(uri.path.slice(folder.uri.path.length + 1), this.options().excludedDirectories);
    }

    private seed(document: vscode.TextDocument): void {
        if (this.accepts(document.uri)) {
            this.buffer.seed(document.uri.toString(), fingerprint(document.getText()));
        }
    }

    private observe(key: string, hash: string, source: 'editor' | 'filesystem'): void {
        if (this.disposed || !this.buffer.observe(key, hash, source) || this.timer) { return; }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.flush();
        }, Math.max(500, this.options().activityCooldownMs));
    }

    private async readChange(uri: vscode.Uri): Promise<void> {
        if (this.disposed || !this.options().enabled || !this.options().trackExternalChanges || !this.accepts(uri)) { return; }
        const key = uri.toString();
        const revision = (this.revisions.get(key) || 0) + 1;
        this.revisions.set(key, revision);
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (!(stat.type & vscode.FileType.File) || stat.size > maxFileSize) { return; }
            const content = await vscode.workspace.fs.readFile(uri);
            if (this.disposed || this.revisions.get(key) !== revision || !this.options().enabled || !this.options().trackExternalChanges) { return; }
            if (content.byteLength > maxFileSize || content.includes(0)) { return; }
            const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === key);
            if (document?.isDirty) { return; }
            this.observe(key, fingerprint(content), 'filesystem');
        } catch {
            // Atomic file replacements can disappear briefly. The create event follows.
        }
    }

    flush(): void {
        const batch = this.buffer.take();
        if (batch && this.options().enabled) { this.onActivity(batch); }
    }

    dispose(): void {
        if (this.disposed) { return; }
        this.disposed = true;
        if (this.timer) { clearTimeout(this.timer); }
        this.flush();
        this.subscriptions.forEach(subscription => subscription.dispose());
    }
}

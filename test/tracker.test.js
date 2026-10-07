const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');

function event() {
    const listeners = new Set();
    return {
        on: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
        fire: value => listeners.forEach(listener => listener(value)),
        get count() { return listeners.size; }
    };
}
const opened = event();
const changed = event();
const created = event();
const diskChanged = event();
const deleted = event();
const files = new Map();
const documents = [];
const vscode = {
    FileType: { File: 1, Directory: 2 },
    workspace: {
        textDocuments: documents,
        getWorkspaceFolder: uri => uri.path.startsWith('/project/') ? { uri: { path: '/project' } } : undefined,
        onDidOpenTextDocument: opened.on,
        onDidChangeTextDocument: changed.on,
        createFileSystemWatcher: () => ({ onDidCreate: created.on, onDidChange: diskChanged.on, onDidDelete: deleted.on, dispose() {} }),
        fs: {
            stat: async uri => ({ type: 1, size: files.get(uri.path).length }),
            readFile: async uri => Buffer.from(files.get(uri.path))
        }
    }
};
const originalLoad = Module._load;
Module._load = function(name, ...args) { return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args); };
const { ActivityTracker } = require('../dist/ActivityTracker');
Module._load = originalLoad;
const uri = path => ({ scheme: 'file', path, toString: () => `file://${path}` });
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup() {
    files.clear();
    documents.length = 0;
    const batches = [];
    const options = { enabled: true, trackExternalChanges: true, activityCooldownMs: 500, excludedDirectories: [] };
    const tracker = new ActivityTracker(() => options, batch => batches.push(batch));
    return { tracker, options, batches };
}

test('closed files written by an agent produce an activity batch without an active editor', async () => {
    const { tracker, batches } = setup();
    const file = uri('/project/src/agent.ts');
    files.set(file.path, 'const agent = true;');
    created.fire(file);
    diskChanged.fire(file);
    await settle();
    tracker.flush();
    assert.deepEqual(batches, [{ files: 1, sources: ['filesystem'] }]);
    tracker.dispose();
});

test('an editor change followed by save and watcher events does not double count', async () => {
    const { tracker, batches } = setup();
    const file = uri('/project/app.ts');
    let text = 'before';
    const document = { uri: file, isDirty: true, getText: () => text };
    documents.push(document);
    opened.fire(document);
    text = 'after';
    changed.fire({ document, contentChanges: [{ text }] });
    tracker.flush();
    document.isDirty = false;
    files.set(file.path, text);
    diskChanged.fire(file);
    await settle();
    tracker.flush();
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].sources, ['editor']);
    tracker.dispose();
});

test('cursor movements and document dirty-state changes without content do not earn XP', () => {
    const { tracker, batches } = setup();
    changed.fire({ document: { uri: uri('/project/app.ts') }, contentChanges: [] });
    tracker.flush();
    assert.equal(batches.length, 0);
    tracker.dispose();
});

test('disabled tracking, excluded code, binary content, and out-of-workspace files are ignored', async () => {
    const { tracker, options, batches } = setup();
    for (const path of ['/project/dist/a.js', '/outside/app.ts', '/project/binary.ts']) {
        files.set(path, 'a\0b');
        diskChanged.fire(uri(path));
    }
    await settle();
    options.trackExternalChanges = false;
    files.set('/project/a.ts', 'valid');
    diskChanged.fire(uri('/project/a.ts'));
    await settle();
    tracker.flush();
    assert.equal(batches.length, 0);
    tracker.dispose();
});

test('deleting a code file counts, duplicated deletion does not, and listeners are disposed', () => {
    const { tracker, batches } = setup();
    deleted.fire(uri('/project/removed.ts'));
    deleted.fire(uri('/project/removed.ts'));
    tracker.dispose();
    tracker.dispose();
    assert.equal(batches.length, 1);
    assert.equal(deleted.count, 0);
    assert.equal(changed.count, 0);
});

test('a fixed time window flushes continuously streamed code changes', async () => {
    const { tracker, batches } = setup();
    const file = uri('/project/stream.ts');
    let text = '0';
    const document = { uri: file, isDirty: true, getText: () => text };
    opened.fire(document);
    const interval = setInterval(() => {
        text += 'a';
        changed.fire({ document, contentChanges: [{ text: 'a' }] });
    }, 50);
    await new Promise(resolve => setTimeout(resolve, 650));
    clearInterval(interval);
    assert.ok(batches.length >= 1);
    tracker.dispose();
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ActivityBuffer, fingerprint, isCodePath } = require('../dist/activity');

test('typing, saving, and duplicate file notifications reward the same content once', () => {
    const activity = new ActivityBuffer();
    activity.seed('file:///project/app.ts', fingerprint('before'));
    assert.equal(activity.observe('file:///project/app.ts', fingerprint('after'), 'editor'), true);
    assert.equal(activity.observe('file:///project/app.ts', fingerprint(Buffer.from('after')), 'filesystem'), false);
    assert.deepEqual(activity.take(), { files: 1, sources: ['editor'] });
    assert.equal(activity.observe('file:///project/app.ts', fingerprint('after'), 'filesystem'), false);
    assert.equal(activity.take(), undefined);
});

test('an agent patch across closed files merges into one batch with human edits', () => {
    const activity = new ActivityBuffer();
    activity.observe('agent.ts', fingerprint('new'), 'filesystem');
    activity.observe('tests.ts', fingerprint('new tests'), 'filesystem');
    activity.observe('human.ts', fingerprint('typed'), 'editor');
    assert.deepEqual(activity.take(), { files: 3, sources: ['filesystem', 'editor'] });
    assert.equal(activity.take(), undefined);
    activity.observe('agent.ts', fingerprint('next edit'), 'filesystem');
    assert.deepEqual(activity.take(), { files: 1, sources: ['filesystem'] });
});

test('repeated edits to one file in a burst count as one file', () => {
    const activity = new ActivityBuffer();
    for (let i = 0; i < 100; i++) { activity.observe('a.ts', fingerprint(String(i)), 'editor'); }
    assert.equal(activity.take().files, 1);
});

test('opening a document does not overwrite a newer observed fingerprint', () => {
    const activity = new ActivityBuffer();
    activity.observe('a.ts', fingerprint('agent result'), 'filesystem');
    activity.seed('a.ts', fingerprint('stale open'));
    activity.take();
    assert.equal(activity.observe('a.ts', fingerprint('agent result'), 'editor'), false);
});

test('code paths ignore generated files, dependencies, lockfiles, and binaries', () => {
    for (const path of ['src/app.ts', 'README.md', 'config.yaml', 'Dockerfile', 'Makefile', 'web\\src\\app.tsx']) {
        assert.equal(isCodePath(path), true, path);
    }
    for (const path of ['node_modules/library/app.js', '.git/config', 'dist/app.js', 'build/app.py', 'target/a.rs', '.venv/a.py', 'package-lock.json', 'public/app.min.js', 'logo.png', 'archive.zip']) {
        assert.equal(isCodePath(path), false, path);
    }
    assert.equal(isCodePath('generated/app.ts', ['generated']), false);
    assert.equal(isCodePath('src/app.ts', ['generated']), true);
});

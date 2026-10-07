const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

async function waitFor(check, message) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (check()) { return; }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(message);
}

exports.run = async function() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'Integration tests require a disposable workspace folder.');
    const config = vscode.workspace.getConfiguration('pokemonCode');
    const settings = ['activityCooldownMs', 'editsPerEncounter', 'encounterMode', 'turnIntervalMs', 'excludedDirectories', 'notifications', 'enabled', 'trackExternalChanges'];
    const previous = settings.map(key => config.inspect(key)?.workspaceValue);
    const fixture = await fs.mkdtemp(path.join(folder.uri.fsPath, '.pokemon-code-test-'));
    try {
        await config.update('enabled', true, vscode.ConfigurationTarget.Workspace);
        await config.update('trackExternalChanges', true, vscode.ConfigurationTarget.Workspace);
        await config.update('activityCooldownMs', 500, vscode.ConfigurationTarget.Workspace);
        await config.update('editsPerEncounter', 1, vscode.ConfigurationTarget.Workspace);
        await config.update('encounterMode', 'battle', vscode.ConfigurationTarget.Workspace);
        await config.update('turnIntervalMs', 1000, vscode.ConfigurationTarget.Workspace);
        await config.update('excludedDirectories', ['.vscode'], vscode.ConfigurationTarget.Workspace);
        await config.update('notifications', false, vscode.ConfigurationTarget.Workspace);
        const extension = vscode.extensions.getExtension('chungmancheng.pokemon-code-2');
        assert.ok(extension);
        const api = await extension.activate();
        const initialBatches = api.getState().trainer.editBatches;

        // Exercise real OS writes to an unopened file, just like an external coding agent.
        const agentPath = path.join(fixture, 'agent.ts');
        await fs.writeFile(agentPath, 'export const agentEdit = 1;\n');
        await waitFor(() => api.getState().trainer.editBatches === initialBatches + 1, 'Agent file creation did not earn XP.');
        assert.ok(api.getState().encounter, 'Code activity should spawn an encounter.');
        await waitFor(() => api.getState().log.some(line => line.includes('damage')), 'The battle did not advance automatically.');
        assert.equal(api.getState().trainer.editBatches, initialBatches + 1, 'Background turns must not manufacture code XP.');
        await fs.writeFile(agentPath, 'export const agentEdit = 2;\n');
        await waitFor(() => api.getState().trainer.editBatches === initialBatches + 2, 'Agent edit to a closed file did not earn XP.');

        // Opening is neutral; editing then saving produces one reward through both APIs.
        const document = await vscode.workspace.openTextDocument(agentPath);
        await vscode.window.showTextDocument(document);
        const beforeEditorEdit = api.getState().trainer.editBatches;
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, new vscode.Position(0, 0), '// Human edit\n');
        assert.ok(await vscode.workspace.applyEdit(edit));
        await document.save();
        await waitFor(() => api.getState().trainer.editBatches === beforeEditorEdit + 1, 'Editor edit did not earn XP.');
        await new Promise(resolve => setTimeout(resolve, 1200));
        assert.equal(api.getState().trainer.editBatches, beforeEditorEdit + 1, 'Save or watcher double-counted an edit.');

        const snapshot = api.getState();
        snapshot.trainer.editBatches = -1;
        assert.notEqual(api.getState().trainer.editBatches, -1, 'Public state snapshots must not mutate the game.');
        await waitFor(() => !api.getState().encounter, 'The automatic battle did not finish without input.');
        assert.ok(api.getState().log.some(line => line.includes('damage') || line.includes('Defeated') || line.includes('fainted')));
        await vscode.commands.executeCommand('pokemonCode.showBattle');
        await vscode.commands.executeCommand('extension.showInventory');
        console.log('Pokémon Code integration passed: real agent edits, editor/save deduplication, automatic battles without further edits, and sidebar commands.');
    } finally {
        await config.update('enabled', false, vscode.ConfigurationTarget.Workspace);
        await fs.rm(fixture, { recursive: true, force: true });
        for (let index = 0; index < settings.length; index++) {
            await config.update(settings[index], previous[index], vscode.ConfigurationTarget.Workspace);
        }
    }
};

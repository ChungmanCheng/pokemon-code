const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function run() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pokemon-code-integration-'));
    const workspace = path.join(root, 'workspace');
    await fs.mkdir(workspace);
    const executable = process.env.VSCODE_EXECUTABLE || (process.platform === 'darwin'
        ? '/Applications/Visual Studio Code.app/Contents/MacOS/Code'
        : process.platform === 'win32'
            ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe') : 'code');
    const repository = path.resolve(__dirname, '..');
    // Seed a disposable extension copy just below evolution, never touching real saves.
    const extensionFixture = path.join(root, 'extension');
    await fs.mkdir(extensionFixture);
    await fs.copyFile(path.join(repository, 'package.json'), path.join(extensionFixture, 'package.json'));
    await fs.cp(path.join(repository, 'dist'), path.join(extensionFixture, 'dist'), { recursive: true });
    // Assets are read-only; a directory link avoids copying thousands of sprites.
    await fs.symlink(path.join(repository, 'imgs'), path.join(extensionFixture, 'imgs'), process.platform === 'win32' ? 'junction' : 'dir');
    await fs.writeFile(path.join(extensionFixture, 'dist', 'data', 'savefile.json'), JSON.stringify({
        pokemon_boxes: [{ id: 1, uid: 'integration-starter', experience: 25 * 15 ** 2 - 5 }]
    }));
    const child = spawn(executable, [
        `--user-data-dir=${path.join(root, 'profile')}`,
        `--extensions-dir=${path.join(root, 'extensions')}`,
        '--disable-extensions', '--skip-welcome', '--skip-release-notes',
        `--extensionDevelopmentPath=${extensionFixture}`,
        `--extensionTestsPath=${__dirname}`, workspace
    ], { stdio: 'inherit' });
    const exitCode = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => resolve(code ?? 1));
    });
    if (exitCode === 0) {
        await fs.rm(root, { recursive: true, force: true });
    } else {
        console.error(`Integration failed. Temporary profile and logs: ${root}`);
        process.exitCode = exitCode;
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });

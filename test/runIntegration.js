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
    const child = spawn(executable, [
        `--user-data-dir=${path.join(root, 'profile')}`,
        `--extensions-dir=${path.join(root, 'extensions')}`,
        '--disable-extensions', '--skip-welcome', '--skip-release-notes',
        `--extensionDevelopmentPath=${repository}`,
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

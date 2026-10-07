import * as vscode from 'vscode';
import { GameState } from './game';

export class NodeInventoryProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event;

    constructor(private readonly state: () => GameState) {}

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    getChildren(): vscode.TreeItem[] {
        return this.state().items.map(item => {
            const row = new vscode.TreeItem(item.name);
            row.description = `× ${item.amount}`;
            row.iconPath = new vscode.ThemeIcon(item.name === 'Razzberry' ? 'gift' : 'circle-large-outline');
            row.tooltip = item.name === 'Razzberry' ? 'Used automatically to improve capture odds.' : 'Used automatically to collect new Pokémon.';
            return row;
        });
    }

    refresh(): void { this.emitter.fire(); }
    dispose(): void { this.emitter.dispose(); }
}

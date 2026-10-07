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
            row.tooltip = item.name === 'Razzberry' ? 'Improves your next catch attempt.' : 'Use to catch the current wild Pokémon.';
            if (item.amount > 0 && this.state().encounter) {
                row.command = {
                    command: item.name === 'Razzberry' ? 'pokemonCode.feedBerry' : 'pokemonCode.catch',
                    title: 'Use item', arguments: item.name === 'Razzberry' ? [] : [item.name]
                };
            }
            return row;
        });
    }

    refresh(): void { this.emitter.fire(); }
    dispose(): void { this.emitter.dispose(); }
}

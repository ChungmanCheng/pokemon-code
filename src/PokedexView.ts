import * as vscode from 'vscode';
import { GameState, xpProgress } from './game';
import { pokemonTypes } from './skills';

export class NodePokedexProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event;

    constructor(private readonly state: () => GameState, private readonly extensionUri: vscode.Uri) {}

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    getChildren(): vscode.TreeItem[] {
        const state = this.state();
        return state.pokemon_boxes.map(pokemon => {
            const row = new vscode.TreeItem(pokemon.name);
            const active = pokemon.uid === state.activePokemonId;
            row.id = pokemon.uid;
            row.description = `Lv. ${pokemon.level}${active ? ' · Active' : ''}`;
            row.tooltip = `${pokemon.name} · ${pokemonTypes(pokemon.id).join(' / ')}\nLevel ${pokemon.level} · ${xpProgress(pokemon.level, pokemon.experience)}\nHP ${pokemon.hp}/${pokemon.maxHp}\nSkills: ${pokemon.skills.map(skill => skill.name).join(', ')}\nBattle partners and skills are chosen automatically.`;
            row.iconPath = vscode.Uri.joinPath(this.extensionUri, 'imgs', 'sprites', `${pokemon.id}.png`);
            return row;
        });
    }

    refresh(): void { this.emitter.fire(); }
    dispose(): void { this.emitter.dispose(); }
}

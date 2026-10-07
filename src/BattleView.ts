import * as vscode from 'vscode';
import { PokemonGame, xpProgress } from './game';
import { pokemonTypes } from './skills';

export class BattleProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event;

    constructor(private readonly game: PokemonGame, private readonly extensionUri: vscode.Uri, private readonly editsPerEncounter: () => number) {}

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    private row(label: string, description?: string, command?: string): vscode.TreeItem {
        const row = new vscode.TreeItem(label);
        row.description = description;
        if (command) { row.command = { command, title: label }; }
        return row;
    }

    getChildren(): vscode.TreeItem[] {
        const { state, active } = this.game;
        const trainer = state.trainer;
        const team = this.row(`${active.name} · Lv. ${active.level}`, `HP ${active.hp}/${active.maxHp}`);
        team.iconPath = vscode.Uri.joinPath(this.extensionUri, 'imgs', 'sprites', `${active.id}.png`);
        team.tooltip = `${pokemonTypes(active.id).join(' / ')}\n${xpProgress(active.level, active.experience)}\nSkills: ${active.skills.map(skill => skill.name).join(', ')}`;
        const skills = this.row('Skills', active.skills.map(skill => skill.name).join(' · '));
        skills.tooltip = active.skills.map(skill => `${skill.name} · ${skill.type} · power ${skill.power}${skill.cooldown ? ` · cooldown ${skill.cooldown} turns` : ''}`).join('\n');
        const rows = [
            this.row(`Trainer · Lv. ${trainer.level}`, xpProgress(trainer.level, trainer.experience)),
            team,
            skills,
            this.row('Journey', `${trainer.editBatches} edit batches · ${trainer.battlesWon} wins · ${trainer.pokemonCaught} catches`)
        ];
        const encounter = state.encounter;
        if (encounter) {
            const wild = encounter.pokemon;
            const row = this.row(`Wild ${wild.name} · Lv. ${wild.level}`, `HP ${wild.hp}/${wild.maxHp}`);
            row.iconPath = vscode.Uri.joinPath(this.extensionUri, 'imgs', 'sprites', `${wild.id}.png`);
            row.tooltip = `${pokemonTypes(wild.id).join(' / ')}\nSkills: ${wild.skills.map(skill => skill.name).join(', ')}`;
            rows.push(row, this.row('Automatic encounter', encounter.mode === 'catch' ? 'Collecting Pokémon' : 'Battling and collecting while you code'));
        } else {
            rows.push(this.row('Exploring', `${Math.min(state.encounterProgress, this.editsPerEncounter())}/${this.editsPerEncounter()} edit batches to next encounter`));
        }
        state.log.slice(-5).reverse().forEach(message => {
            const row = this.row(message);
            row.tooltip = message;
            rows.push(row);
        });
        return rows;
    }

    refresh(): void { this.emitter.fire(); }
    dispose(): void { this.emitter.dispose(); }
}

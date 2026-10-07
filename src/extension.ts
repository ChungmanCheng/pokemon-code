import * as vscode from 'vscode';
import { ActivityTracker, TrackingOptions } from './ActivityTracker';
import { AutomaticEncounters } from './AutomaticEncounters';
import { NodeInventoryProvider } from './InventoryView';
import { NodePokedexProvider } from './PokedexView';
import { BattleProvider } from './BattleView';
import { EncounterMode, GameResult, GameState, loadState, PokemonGame, xpProgress } from './game';
import pokedex from './data/pokedex.json';

const storageKey = 'pokemonCode.game.v1';
let tracker: ActivityTracker | undefined;
let encounters: AutomaticEncounters | undefined;
let pendingSave: Promise<void> = Promise.resolve();

function configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('pokemonCode');
}

function trackingOptions(): TrackingOptions {
    const config = configuration();
    return {
        enabled: config.get('enabled', true),
        trackExternalChanges: config.get('trackExternalChanges', true),
        activityCooldownMs: config.get('activityCooldownMs', 3000),
        excludedDirectories: config.get('excludedDirectories', [])
    };
}

async function legacySave(context: vscode.ExtensionContext): Promise<unknown> {
    try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist', 'data', 'savefile.json'));
        return JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
        return undefined;
    }
}

export async function activate(context: vscode.ExtensionContext): Promise<{ getState(): GameState }> {
    const starter = { Bulbasaur: 1, Charmander: 4, Squirtle: 7 }[configuration().get<'Bulbasaur' | 'Charmander' | 'Squirtle'>('starter', 'Bulbasaur')];
    const saved = context.globalState.get<unknown>(storageKey);
    const game = new PokemonGame(loadState(saved ?? await legacySave(context), pokedex, starter), pokedex);
    const output = vscode.window.createOutputChannel('Pokémon Code');
    const editsPerEncounter = () => Math.max(1, configuration().get('editsPerEncounter', 8));
    const inventoryProvider = new NodeInventoryProvider(() => game.state);
    const pokedexProvider = new NodePokedexProvider(() => game.state, context.extensionUri);
    const battleProvider = new BattleProvider(game, context.extensionUri, editsPerEncounter);
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    status.command = 'pokemonCode.showBattle';
    let saveErrorReported = false;

    const refresh = () => {
        inventoryProvider.refresh();
        pokedexProvider.refresh();
        battleProvider.refresh();
        const wild = game.state.encounter?.pokemon;
        status.text = `$(zap) ${game.active.name} Lv.${game.active.level}${wild ? ` · ${wild.name} ${wild.hp}/${wild.maxHp} HP` : ` · Trainer Lv.${game.state.trainer.level}`}`;
        status.tooltip = `${xpProgress(game.active.level, game.active.experience)}\nYour Pokémon handles battles and captures automatically.${trackingOptions().enabled ? '' : '\nThe journey is paused in settings.'}`;
    };

    const save = () => {
        const snapshot = JSON.parse(JSON.stringify(game.state));
        pendingSave = pendingSave.then(async () => {
            try {
                await context.globalState.update(storageKey, snapshot);
                saveErrorReported = false;
            } catch (error) {
                output.appendLine(`Save failed: ${String(error)}`);
                if (!saveErrorReported) {
                    saveErrorReported = true;
                    void vscode.window.showWarningMessage('Pokémon Code could not save your progress. See the Pokémon Code output for details.');
                }
            }
        });
        refresh();
        encounters?.sync();
    };

    const apply = (result: GameResult) => {
        save();
        result.messages.forEach(message => output.appendLine(message));
        if (configuration().get('notifications', false) && result.messages.length) {
            void vscode.window.showInformationMessage(result.messages.join(' '));
        }
    };

    encounters = new AutomaticEncounters(
        () => trackingOptions().enabled && !!game.state.encounter,
        () => configuration().get('turnIntervalMs', 2000),
        () => apply(game.autoTurn())
    );
    tracker = new ActivityTracker(trackingOptions, batch => {
        output.appendLine(`Code activity: ${batch.files} file(s), ${batch.sources.join(' + ')}.`);
        const configured = configuration().get<string>('encounterMode', 'auto');
        const mode: EncounterMode = configured === 'catch' || configured === 'battle' ? configured : 'auto';
        apply(game.recordActivity(editsPerEncounter(), mode));
    });

    context.subscriptions.push(
        encounters, tracker, output, status, inventoryProvider, pokedexProvider, battleProvider,
        vscode.window.registerTreeDataProvider('package-inventory', inventoryProvider),
        vscode.window.registerTreeDataProvider('package-pokedex', pokedexProvider),
        vscode.window.registerTreeDataProvider('package-battle', battleProvider),
        vscode.commands.registerCommand('extension.showPokemon', () => vscode.commands.executeCommand('package-pokedex.focus')),
        vscode.commands.registerCommand('extension.showInventory', () => vscode.commands.executeCommand('package-inventory.focus')),
        vscode.commands.registerCommand('pokemonCode.showBattle', () => vscode.commands.executeCommand('package-battle.focus')),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('pokemonCode')) { refresh(); encounters?.sync(); }
        })
    );
    save();
    status.show();
    output.appendLine('Journey ready. Keep coding; your Pokémon handles encounters automatically.');
    return { getState: () => JSON.parse(JSON.stringify(game.state)) as GameState };
}

export function deactivate(): Promise<void> {
    encounters?.dispose();
    encounters = undefined;
    tracker?.dispose();
    tracker = undefined;
    return pendingSave;
}

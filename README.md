# Pokémon Code

Catch, battle, and level up Pokémon while coding in VS Code. This project is forked from [matthewkremer/pokemon-code](https://github.com/matthewkremer/pokemon-code).

## How to play

Open the **Pocket** activity-bar icon. **Battle and Trainer** shows your trainer level, active Pokémon, wild encounter, HP, and recent battle events. **Pokedex** shows your collection; click a Pokémon to train and battle with it. **Inventory** shows your balls and berries; click an item to use it during an encounter. The status bar also shows your active Pokémon and current opponent.

A new journey starts with a level 5 Bulbasaur. Set `pokemonCode.starter` to `Charmander` or `Squirtle` before the first activation to choose a different starter. Existing collections are imported and kept.

- Actual code changes earn trainer XP and active Pokémon XP. Moving the cursor, opening files, and saving unchanged content do not earn rewards.
- Changes within a 3-second window form one edit batch. Each batch earns 8 trainer XP and 10 Pokémon XP. Large patches and multi-file edits earn one batch reward, so generated change volume does not determine progress.
- After 8 exploration batches, a wild Pokémon appears at a level near your active Pokémon. The next batches advance the encounter.
- By default, each batch performs a battle turn. Click **Battle / Attack** to attack immediately. Winning grants bonus XP and Pokeballs.
- Click **Catch** to choose a ball. Greatballs and Ultraballs have better odds; reducing wild HP and feeding a Razzberry improves the chance. A failed throw consumes its ball, and a berry applies to one throw. During battle, a failed catch allows the opponent to attack.
- Your team heals after every encounter, including a loss or retreat. Trainer level-ups, every tenth coding batch, and battle wins replenish Pokeballs.

Trainer and Pokémon levels cap at 100. Their XP is separate from the species base experience stored in the original Pokédex data. Each captured Pokémon has its own level, XP, and identity, including duplicate species.

## Coding agents

Agent edits use the same rewards and battle rules as human edits. Workspace file creation, modification, and deletion are tracked even when the file is closed and no editor is active. This includes agents running in an editor or terminal, provided they modify files in a folder opened in this VS Code window while the extension is running. Agents editing a separate worktree need that worktree opened in VS Code to earn progress there.

Editor changes and disk notifications are deduplicated by content, so typing and then saving does not reward the edit twice. Related changes are batched, and continuous agent streams keep progressing without waiting for the stream to stop. Dependencies, build output, caches, Git metadata, lockfiles, minified assets, and binary files are excluded. External files over 1 MiB are ignored. VS Code's file-watcher exclusions also apply.

Choose the encounter behavior in settings:

```json
{
  "pokemonCode.trackExternalChanges": true,
  "pokemonCode.encounterMode": "battle"
}
```

`battle` advances attacks automatically, `catch` automatically throws available balls and falls back to battling when supplies run out, and `manual` keeps awarding XP while waiting for you to choose an action in the sidebar. Automatic modes support unattended agent coding. Popup notifications are off by default; enable `pokemonCode.notifications` for encounter choices and milestones.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `pokemonCode.enabled` | `true` | Enable rewards from code changes. |
| `pokemonCode.trackExternalChanges` | `true` | Count agent and tool changes to workspace files. |
| `pokemonCode.encounterMode` | `battle` | Behavior for newly spawned encounters: `battle`, `catch`, or `manual`. |
| `pokemonCode.editsPerEncounter` | `8` | Exploration batches before an encounter. |
| `pokemonCode.activityCooldownMs` | `3000` | Duration of an edit batching window, minimum 500 ms. |
| `pokemonCode.excludedDirectories` | `[]` | Additional directory names to ignore. |
| `pokemonCode.notifications` | `false` | Show encounter and milestone popups. |
| `pokemonCode.starter` | `Bulbasaur` | Starter for a new journey. |

Progress and current encounters persist in VS Code extension storage across restarts and extension updates. The first run migrates the legacy `dist/data/savefile.json` collection and inventory. Progress is shared across workspaces in the same VS Code profile. It is not automatically synchronized between computers or separate extension hosts.

## Commands

Open the Command Palette and search **Pokemon Code** for Pokedex, Inventory, Battle and Trainer, Select Active Pokemon, Battle / Attack, Catch Wild Pokemon, Feed Razzberry, and Run from Encounter. The **Pokémon Code** output channel records activity sources and milestones.

## Development

Requires Node.js 18 or later for the test runner and VS Code 1.73 or later for the extension.

```sh
npm install
npm run compile
npm run lint
npm test
npm run test:integration
```

Press **F5** in VS Code to launch the extension development host. Open a code folder in that host and make edits to start playing. `npm run test:integration` launches a real VS Code extension host with a temporary profile and workspace. Set `VSCODE_EXECUTABLE` if VS Code is installed at a custom path. The existing **Launch Tests** debug entry expects a disposable workspace.

The test suite covers XP thresholds, legacy save migration, restored encounters, battles, captures, inventory consumption, content deduplication, agent edits to closed files, filters, and event cleanup.

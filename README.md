# Pokémon Code

Your Pokémon trains, battles, and collects new friends while you code. The extension runs in VS Code and rewards both manual and coding-agent edits. This project is forked from [matthewkremer/pokemon-code](https://github.com/matthewkremer/pokemon-code).

## How it works

Open **Pocket** in the activity bar to see your trainer, team, collection, inventory, and recent encounters. The status bar shows your active Pokémon and opponent. Gameplay runs automatically; you keep working.

- Actual code changes earn trainer XP and Pokémon XP. Cursor movement, opening files, and saving unchanged editor content do not earn rewards.
- Changes within a 3-second window form one edit batch. Each batch grants 8 trainer XP and 10 Pokémon XP, including multi-file agent patches.
- After 8 exploration batches, a wild Pokémon appears near your partner's level. Your team chooses its battle partner automatically.
- Encounter turns run every 2 seconds, even when coding pauses. Pokémon handle attacks and capture supplies without asking you to choose actions.
- Pokémon learn skills as they level up and choose their own moves based on type matchups and cooldowns. Stronger skills unlock at levels 5, 12, and 24. Your team automatically selects a suitable partner for each opponent.
- New species are weakened and collected automatically. Already-owned species are battled for XP. Pokémon choose balls and use Razzberries to improve capture odds.
- The team heals after encounters. Trainer level-ups, every tenth coding batch, and battle wins replenish Pokeballs.

A new journey starts with a level 5 Bulbasaur. Trainer and Pokémon levels cap at 100. Captured Pokémon have individual levels and XP, including duplicate species.

## Coding agents

Agent changes use the same rewards as human edits. Creating, editing, or deleting workspace code files counts even when those files are closed and no editor is active. The workspace must be open in running VS Code; agents working in a separate worktree need that worktree opened there.

Editor and file-watcher events are deduplicated by content. Related changes form one reward batch, and continuous agent streams keep earning XP. Dependencies, build output, caches, Git metadata, lockfiles, minified assets, binary files, and external files over 1 MiB are ignored. VS Code file-watcher exclusions also apply.

## Settings

Defaults provide fully automatic gameplay. No configuration or gameplay decisions are needed.

| Setting | Default | Purpose |
| --- | --- | --- |
| `pokemonCode.enabled` | `true` | Enable code rewards and automatic encounters. |
| `pokemonCode.trackExternalChanges` | `true` | Include workspace changes from agents and tools. |
| `pokemonCode.encounterMode` | `auto` | Weaken and collect new species; battle known ones. `battle` and `catch` optionally specialize this automatic behavior. |
| `pokemonCode.editsPerEncounter` | `8` | Exploration batches before an encounter. |
| `pokemonCode.activityCooldownMs` | `3000` | Code activity batching window. |
| `pokemonCode.turnIntervalMs` | `2000` | Time between automatic encounter turns. |
| `pokemonCode.excludedDirectories` | `[]` | Additional directory names to ignore. |
| `pokemonCode.notifications` | `false` | Informational milestones, with no decision prompts. |
| `pokemonCode.starter` | `Bulbasaur` | Starter for a new journey; existing collections are kept. |

Progress and current encounters persist in VS Code extension storage across restarts and updates. The first run migrates the original `dist/data/savefile.json` collection and inventory. Progress is shared across workspaces in the same VS Code profile and is not synchronized across computers or separate extension hosts.

The Command Palette has **Pokemon Code - Pokedex**, **Inventory**, and **Battle and Trainer** commands. They open the relevant views. The **Pokémon Code** output channel records coding activity and milestones.

## Development

Requires Node.js 18 or later for tests and VS Code 1.73 or later for the extension.

```sh
npm install
npm run compile
npm run lint
npm test
npm run test:integration
```

Press **F5** to launch the development host, open a code folder, and edit files. The integration command launches real VS Code with a temporary profile and workspace. Set `VSCODE_EXECUTABLE` for a custom installation path. The **Launch Tests** debug entry expects a disposable workspace.

Tests cover XP, saves, automatic encounters, capture supplies, editor/save deduplication, agent edits to closed files, filters, timer cleanup, and real VS Code events.

Pokémon types and the type-effectiveness chart are bundled from [PokéAPI's dataset](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv). Skill powers, unlock levels, and learnsets are simplified for this extension. Gameplay needs no network requests.

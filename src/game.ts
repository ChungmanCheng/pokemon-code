import { randomUUID } from 'crypto';

export interface Species {
    id: number;
    name: string;
    /** Base species experience, retained for compatibility with old saves. */
    exp: number;
}

export interface Pokemon extends Species {
    uid: string;
    level: number;
    experience: number;
    hp: number;
    maxHp: number;
}

export type Ball = 'Pokeball' | 'Greatball' | 'Ultraball';
export type ItemName = Ball | 'Razzberry';
export type EncounterMode = 'battle' | 'catch' | 'manual';

export interface Encounter {
    pokemon: Pokemon;
    mode: EncounterMode;
    berry: boolean;
}

export interface GameState {
    version: 1;
    items: { name: ItemName; amount: number }[];
    pokemon_boxes: Pokemon[];
    activePokemonId: string;
    trainer: {
        level: number;
        experience: number;
        editBatches: number;
        battlesWon: number;
        pokemonCaught: number;
    };
    encounter?: Encounter;
    encounterProgress: number;
    log: string[];
}

export interface GameResult {
    messages: string[];
    spawned?: string;
}

const initialItems: { name: ItemName; amount: number }[] = [
    { name: 'Pokeball', amount: 50 },
    { name: 'Greatball', amount: 10 },
    { name: 'Ultraball', amount: 5 },
    { name: 'Razzberry', amount: 2 }
];

export function experienceAtLevel(level: number): number {
    return 25 * (level - 1) ** 2;
}

export function levelForExperience(experience: number): number {
    return Math.min(100, Math.floor(Math.sqrt(Math.max(0, experience) / 25)) + 1);
}

export function xpProgress(level: number, experience: number): string {
    if (level >= 100) { return 'Max level'; }
    return `${experience - experienceAtLevel(level)}/${experienceAtLevel(level + 1) - experienceAtLevel(level)} XP`;
}

export function maxHp(species: Species, level: number): number {
    return 20 + level * 4 + Math.floor(species.exp / 12);
}

function makePokemon(species: Species, level: number): Pokemon {
    return {
        ...species, uid: randomUUID(), level, experience: experienceAtLevel(level),
        hp: maxHp(species, level), maxHp: maxHp(species, level)
    };
}

function integer(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;
}

function record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/** Import both the original JSON save and the new persisted game state. */
export function loadState(value: unknown, species: readonly Species[], starterId = 1): GameState {
    const raw = record(value);
    const usedIds = new Set<string>();
    const restorePokemon = (value: unknown): Pokemon | undefined => {
        const data = record(value);
        const entry = species.find(pokemon => pokemon.id === data.id);
        if (!entry) { return undefined; }
        const experience = integer(data.experience, experienceAtLevel(Math.max(1, integer(data.level, 5, 100))), experienceAtLevel(100));
        const pokemon = makePokemon(entry, levelForExperience(experience));
        if (typeof data.uid === 'string' && data.uid && !usedIds.has(data.uid)) {
            pokemon.uid = data.uid;
        }
        usedIds.add(pokemon.uid);
        pokemon.experience = experience;
        pokemon.hp = integer(data.hp, pokemon.maxHp, pokemon.maxHp);
        return pokemon;
    };
    const boxes = Array.isArray(raw.pokemon_boxes)
        ? raw.pokemon_boxes.map(restorePokemon).filter((pokemon): pokemon is Pokemon => !!pokemon) : [];
    if (!boxes.length) {
        const starter = species.find(pokemon => pokemon.id === starterId) || species[0];
        if (!starter) { throw new Error('The Pokédex is empty.'); }
        boxes.push(makePokemon(starter, 5));
    }
    const trainer = record(raw.trainer);
    const experience = integer(trainer.experience, 0, experienceAtLevel(100));
    const state: GameState = {
        version: 1,
        items: initialItems.map(item => {
            const saved = Array.isArray(raw.items) ? raw.items.map(record).find(saved => saved.name === item.name) : undefined;
            return { ...item, amount: integer(saved?.amount, item.amount) };
        }),
        pokemon_boxes: boxes,
        activePokemonId: boxes.find(pokemon => pokemon.uid === raw.activePokemonId)?.uid || boxes[0].uid,
        trainer: {
            level: levelForExperience(experience), experience,
            editBatches: integer(trainer.editBatches, 0),
            battlesWon: integer(trainer.battlesWon, 0),
            pokemonCaught: integer(trainer.pokemonCaught, Array.isArray(raw.pokemon_boxes) && raw.pokemon_boxes.length ? boxes.length : 0)
        },
        encounterProgress: integer(raw.encounterProgress, 0),
        log: Array.isArray(raw.log) ? raw.log.filter((line): line is string => typeof line === 'string').slice(-8) : []
    };
    const savedEncounter = record(raw.encounter);
    const wild = restorePokemon(savedEncounter.pokemon);
    if (wild && wild.hp > 0) {
        const mode = savedEncounter.mode;
        state.encounter = { pokemon: wild, mode: mode === 'catch' || mode === 'manual' ? mode : 'battle', berry: savedEncounter.berry === true };
    }
    if (!state.encounter) { boxes.forEach(pokemon => { pokemon.hp = pokemon.maxHp; }); }
    return state;
}

export class PokemonGame {
    constructor(
        public readonly state: GameState,
        private readonly species: readonly Species[],
        private readonly random: () => number = Math.random
    ) {}

    get active(): Pokemon {
        return this.state.pokemon_boxes.find(pokemon => pokemon.uid === this.state.activePokemonId) || this.state.pokemon_boxes[0];
    }

    selectPokemon(uid: string): boolean {
        if (!this.state.pokemon_boxes.some(pokemon => pokemon.uid === uid && pokemon.hp > 0)) { return false; }
        this.state.activePokemonId = uid;
        return true;
    }

    itemCount(name: ItemName): number {
        return this.state.items.find(item => item.name === name)?.amount || 0;
    }

    private addItem(name: ItemName, amount: number): void {
        const item = this.state.items.find(item => item.name === name);
        if (item) { item.amount += amount; }
    }

    private result(): GameResult { return { messages: [] }; }

    private log(message: string, result: GameResult, notify = false): void {
        this.state.log.push(message);
        this.state.log = this.state.log.slice(-8);
        if (notify) { result.messages.push(message); }
    }

    private awardXp(pokemon: Pokemon, amount: number, result: GameResult): void {
        const before = pokemon.level;
        pokemon.experience = Math.min(experienceAtLevel(100), pokemon.experience + amount);
        pokemon.level = levelForExperience(pokemon.experience);
        const oldMax = pokemon.maxHp;
        pokemon.maxHp = maxHp(pokemon, pokemon.level);
        pokemon.hp = Math.min(pokemon.maxHp, pokemon.hp + pokemon.maxHp - oldMax);
        if (pokemon.level > before) {
            this.log(`${pokemon.name} grew to level ${pokemon.level}!`, result, true);
        }
    }

    private awardTrainerXp(amount: number, result: GameResult): void {
        const trainer = this.state.trainer;
        const before = trainer.level;
        trainer.experience = Math.min(experienceAtLevel(100), trainer.experience + amount);
        trainer.level = levelForExperience(trainer.experience);
        if (trainer.level > before) {
            this.addItem('Pokeball', 3 * (trainer.level - before));
            this.log(`Trainer level ${trainer.level}! Received ${3 * (trainer.level - before)} Pokeballs.`, result, true);
        }
    }

    /** One reward per edit batch, regardless of file size or who made the edit. */
    recordActivity(editsPerEncounter: number, mode: EncounterMode): GameResult {
        const result = this.result();
        this.state.trainer.editBatches++;
        this.awardTrainerXp(8, result);
        this.awardXp(this.active, 10, result);
        if (this.state.trainer.editBatches % 10 === 0) {
            this.addItem('Pokeball', 2);
            this.log('Coding supplies: received 2 Pokeballs.', result);
        }
        if (this.state.encounter) {
            const action = this.state.encounter.mode;
            if (action === 'battle') { this.battleTurn(result); }
            if (action === 'catch') {
                const ball = (['Pokeball', 'Greatball', 'Ultraball'] as Ball[]).find(ball => this.itemCount(ball) > 0);
                if (ball) { this.catchPokemon(ball, result); }
                else {
                    this.state.encounter.mode = 'battle';
                    this.log('No balls left. Switched to battle mode.', result, true);
                    this.battleTurn(result);
                }
            }
        } else {
            this.active.hp = this.active.maxHp;
            this.state.encounterProgress++;
            if (this.state.encounterProgress >= Math.max(1, editsPerEncounter)) {
                this.state.encounterProgress = 0;
                const species = this.species[Math.min(this.species.length - 1, Math.floor(this.random() * this.species.length))];
                const level = Math.min(100, Math.max(1, this.active.level + Math.floor(this.random() * 5) - 2));
                const wild = makePokemon(species, level);
                this.state.encounter = { pokemon: wild, mode, berry: false };
                result.spawned = wild.uid;
                this.log(`A wild ${wild.name} (Lv. ${wild.level}) appeared!`, result, true);
            }
        }
        return result;
    }

    private damage(attacker: Pokemon): number {
        return Math.max(1, Math.floor((5 + attacker.level * 2 + attacker.exp / 40) * (0.85 + this.random() * 0.3)));
    }

    private finishEncounter(): void {
        this.state.encounter = undefined;
        this.state.pokemon_boxes.forEach(pokemon => { pokemon.hp = pokemon.maxHp; });
    }

    attack(): GameResult {
        const result = this.result();
        if (this.state.encounter) {
            this.state.encounter.mode = 'battle';
            this.battleTurn(result);
        }
        return result;
    }

    private battleTurn(result: GameResult): void {
        const encounter = this.state.encounter;
        if (!encounter) { return; }
        const wild = encounter.pokemon;
        const damage = this.damage(this.active);
        wild.hp = Math.max(0, wild.hp - damage);
        this.log(`${this.active.name} dealt ${damage} damage to ${wild.name}.`, result);
        if (wild.hp === 0) {
            const xp = Math.floor(wild.exp / 2) + wild.level * 5;
            this.state.trainer.battlesWon++;
            this.awardXp(this.active, xp, result);
            this.awardTrainerXp(30, result);
            this.addItem('Pokeball', 2);
            this.log(`Defeated ${wild.name}! +${xp} Pokémon XP and 2 Pokeballs.`, result, true);
            this.finishEncounter();
        } else {
            this.counterattack(result);
        }
    }

    private counterattack(result: GameResult): void {
        const encounter = this.state.encounter;
        if (!encounter) { return; }
        const damage = this.damage(encounter.pokemon);
        this.active.hp = Math.max(0, this.active.hp - damage);
        this.log(`${encounter.pokemon.name} dealt ${damage} damage to ${this.active.name}.`, result);
        if (this.active.hp === 0) {
            this.log(`${this.active.name} fainted. Your team recovered; keep coding to explore again.`, result, true);
            this.finishEncounter();
        }
    }

    catch(ball: Ball): GameResult {
        const result = this.result();
        this.catchPokemon(ball, result);
        return result;
    }

    private catchPokemon(ball: Ball, result: GameResult): void {
        const encounter = this.state.encounter;
        if (!encounter || this.itemCount(ball) < 1) { return; }
        this.addItem(ball, -1);
        const wild = encounter.pokemon;
        const multiplier = { Pokeball: 1, Greatball: 1.35, Ultraball: 1.7 }[ball];
        const base = Math.max(0.12, 0.65 - wild.exp / 650);
        const weakened = (1 - wild.hp / wild.maxHp) * 0.4;
        const chance = Math.min(0.95, (base + weakened) * multiplier * (encounter.berry ? 1.4 : 1));
        encounter.berry = false;
        if (this.random() < chance) {
            this.state.pokemon_boxes.push(wild);
            this.state.trainer.pokemonCaught++;
            this.awardXp(this.active, 15 + wild.level * 2, result);
            this.awardTrainerXp(20, result);
            this.log(`Caught ${wild.name} (Lv. ${wild.level})!`, result, true);
            this.finishEncounter();
        } else {
            this.log(`${wild.name} broke free from the ${ball}.`, result, true);
            if (encounter.mode === 'battle') { this.counterattack(result); }
        }
    }

    feedBerry(): GameResult {
        const result = this.result();
        if (this.state.encounter && !this.state.encounter.berry && this.itemCount('Razzberry') > 0) {
            this.addItem('Razzberry', -1);
            this.state.encounter.berry = true;
            this.log(`Fed a Razzberry to ${this.state.encounter.pokemon.name}. The next catch has better odds.`, result, true);
        }
        return result;
    }

    run(): GameResult {
        const result = this.result();
        if (this.state.encounter) {
            this.log(`Left the encounter with ${this.state.encounter.pokemon.name}.`, result);
            this.finishEncounter();
        }
        return result;
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokemonGame = exports.loadState = exports.maxHp = exports.xpProgress = exports.levelForExperience = exports.experienceAtLevel = void 0;
const crypto_1 = require("crypto");
const initialItems = [
    { name: 'Pokeball', amount: 50 },
    { name: 'Greatball', amount: 10 },
    { name: 'Ultraball', amount: 5 },
    { name: 'Razzberry', amount: 2 }
];
function experienceAtLevel(level) {
    return 25 * (level - 1) ** 2;
}
exports.experienceAtLevel = experienceAtLevel;
function levelForExperience(experience) {
    return Math.min(100, Math.floor(Math.sqrt(Math.max(0, experience) / 25)) + 1);
}
exports.levelForExperience = levelForExperience;
function xpProgress(level, experience) {
    if (level >= 100) {
        return 'Max level';
    }
    return `${experience - experienceAtLevel(level)}/${experienceAtLevel(level + 1) - experienceAtLevel(level)} XP`;
}
exports.xpProgress = xpProgress;
function maxHp(species, level) {
    return 20 + level * 4 + Math.floor(species.exp / 12);
}
exports.maxHp = maxHp;
function makePokemon(species, level) {
    return {
        ...species, uid: (0, crypto_1.randomUUID)(), level, experience: experienceAtLevel(level),
        hp: maxHp(species, level), maxHp: maxHp(species, level)
    };
}
function integer(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;
}
function record(value) {
    return value !== null && typeof value === 'object' ? value : {};
}
/** Import both the original JSON save and the new persisted game state. */
function loadState(value, species, starterId = 1) {
    const raw = record(value);
    const usedIds = new Set();
    const restorePokemon = (value) => {
        const data = record(value);
        const entry = species.find(pokemon => pokemon.id === data.id);
        if (!entry) {
            return undefined;
        }
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
        ? raw.pokemon_boxes.map(restorePokemon).filter((pokemon) => !!pokemon) : [];
    if (!boxes.length) {
        const starter = species.find(pokemon => pokemon.id === starterId) || species[0];
        if (!starter) {
            throw new Error('The Pokédex is empty.');
        }
        boxes.push(makePokemon(starter, 5));
    }
    const trainer = record(raw.trainer);
    const experience = integer(trainer.experience, 0, experienceAtLevel(100));
    const state = {
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
        log: Array.isArray(raw.log) ? raw.log.filter((line) => typeof line === 'string').slice(-8) : []
    };
    const savedEncounter = record(raw.encounter);
    const wild = restorePokemon(savedEncounter.pokemon);
    if (wild && wild.hp > 0) {
        const mode = savedEncounter.mode;
        state.encounter = { pokemon: wild, mode: mode === 'catch' || mode === 'manual' ? mode : 'battle', berry: savedEncounter.berry === true };
    }
    if (!state.encounter) {
        boxes.forEach(pokemon => { pokemon.hp = pokemon.maxHp; });
    }
    return state;
}
exports.loadState = loadState;
class PokemonGame {
    constructor(state, species, random = Math.random) {
        this.state = state;
        this.species = species;
        this.random = random;
    }
    get active() {
        return this.state.pokemon_boxes.find(pokemon => pokemon.uid === this.state.activePokemonId) || this.state.pokemon_boxes[0];
    }
    selectPokemon(uid) {
        if (!this.state.pokemon_boxes.some(pokemon => pokemon.uid === uid && pokemon.hp > 0)) {
            return false;
        }
        this.state.activePokemonId = uid;
        return true;
    }
    itemCount(name) {
        return this.state.items.find(item => item.name === name)?.amount || 0;
    }
    addItem(name, amount) {
        const item = this.state.items.find(item => item.name === name);
        if (item) {
            item.amount += amount;
        }
    }
    result() { return { messages: [] }; }
    log(message, result, notify = false) {
        this.state.log.push(message);
        this.state.log = this.state.log.slice(-8);
        if (notify) {
            result.messages.push(message);
        }
    }
    awardXp(pokemon, amount, result) {
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
    awardTrainerXp(amount, result) {
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
    recordActivity(editsPerEncounter, mode) {
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
            if (action === 'battle') {
                this.battleTurn(result);
            }
            if (action === 'catch') {
                const ball = ['Pokeball', 'Greatball', 'Ultraball'].find(ball => this.itemCount(ball) > 0);
                if (ball) {
                    this.catchPokemon(ball, result);
                }
                else {
                    this.state.encounter.mode = 'battle';
                    this.log('No balls left. Switched to battle mode.', result, true);
                    this.battleTurn(result);
                }
            }
        }
        else {
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
    damage(attacker) {
        return Math.max(1, Math.floor((5 + attacker.level * 2 + attacker.exp / 40) * (0.85 + this.random() * 0.3)));
    }
    finishEncounter() {
        this.state.encounter = undefined;
        this.state.pokemon_boxes.forEach(pokemon => { pokemon.hp = pokemon.maxHp; });
    }
    attack() {
        const result = this.result();
        if (this.state.encounter) {
            this.state.encounter.mode = 'battle';
            this.battleTurn(result);
        }
        return result;
    }
    battleTurn(result) {
        const encounter = this.state.encounter;
        if (!encounter) {
            return;
        }
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
        }
        else {
            this.counterattack(result);
        }
    }
    counterattack(result) {
        const encounter = this.state.encounter;
        if (!encounter) {
            return;
        }
        const damage = this.damage(encounter.pokemon);
        this.active.hp = Math.max(0, this.active.hp - damage);
        this.log(`${encounter.pokemon.name} dealt ${damage} damage to ${this.active.name}.`, result);
        if (this.active.hp === 0) {
            this.log(`${this.active.name} fainted. Your team recovered; keep coding to explore again.`, result, true);
            this.finishEncounter();
        }
    }
    catch(ball) {
        const result = this.result();
        this.catchPokemon(ball, result);
        return result;
    }
    catchPokemon(ball, result) {
        const encounter = this.state.encounter;
        if (!encounter || this.itemCount(ball) < 1) {
            return;
        }
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
        }
        else {
            this.log(`${wild.name} broke free from the ${ball}.`, result, true);
            if (encounter.mode === 'battle') {
                this.counterattack(result);
            }
        }
    }
    feedBerry() {
        const result = this.result();
        if (this.state.encounter && !this.state.encounter.berry && this.itemCount('Razzberry') > 0) {
            this.addItem('Razzberry', -1);
            this.state.encounter.berry = true;
            this.log(`Fed a Razzberry to ${this.state.encounter.pokemon.name}. The next catch has better odds.`, result, true);
        }
        return result;
    }
    run() {
        const result = this.result();
        if (this.state.encounter) {
            this.log(`Left the encounter with ${this.state.encounter.pokemon.name}.`, result);
            this.finishEncounter();
        }
        return result;
    }
}
exports.PokemonGame = PokemonGame;
//# sourceMappingURL=game.js.map
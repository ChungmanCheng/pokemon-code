"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokemonGame = exports.loadState = exports.maxHp = exports.xpProgress = exports.levelForExperience = exports.experienceAtLevel = void 0;
const crypto_1 = require("crypto");
const skills_1 = require("./skills");
const evolution_1 = require("./evolution");
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
        hp: maxHp(species, level), maxHp: maxHp(species, level),
        skills: (0, skills_1.skillsForPokemon)(species.id, level), skillCooldowns: {}
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
        const cooldowns = record(data.skillCooldowns);
        pokemon.skills.forEach(skill => {
            const remaining = integer(cooldowns[skill.id], 0, skill.cooldown + 1);
            if (remaining > 0) {
                pokemon.skillCooldowns[skill.id] = remaining;
            }
        });
        if (typeof data.lastSkill === 'string' && (data.lastSkill === 'Struggle' || pokemon.skills.some(skill => skill.name === data.lastSkill))) {
            pokemon.lastSkill = data.lastSkill;
        }
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
        state.encounter = { pokemon: wild, mode: mode === 'catch' || mode === 'battle' ? mode : 'auto', berry: savedEncounter.berry === true };
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
        // Catch up existing collections without changing a persisted wild encounter.
        const result = this.result();
        this.state.pokemon_boxes.forEach(pokemon => this.evolve(pokemon, result));
    }
    get active() {
        return this.state.pokemon_boxes.find(pokemon => pokemon.uid === this.state.activePokemonId) || this.state.pokemon_boxes[0];
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
    refreshPokemon(pokemon, result) {
        const previousSkills = new Set(pokemon.skills.map(skill => skill.id));
        const oldMax = pokemon.maxHp;
        pokemon.maxHp = maxHp(pokemon, pokemon.level);
        // Evolution adds HP capacity while retaining damage and fainted status.
        pokemon.hp = pokemon.hp === 0 ? 0 : Math.max(1, Math.min(pokemon.maxHp, pokemon.hp + pokemon.maxHp - oldMax));
        pokemon.skills = (0, skills_1.skillsForPokemon)(pokemon.id, pokemon.level);
        const learned = pokemon.skills.filter(skill => !previousSkills.has(skill.id));
        if (learned.length) {
            this.log(`${pokemon.name} learned ${learned.map(skill => skill.name).join(', ')}!`, result, true);
        }
        for (const id of Object.keys(pokemon.skillCooldowns)) {
            if (!pokemon.skills.some(skill => skill.id === id)) {
                delete pokemon.skillCooldowns[id];
            }
        }
        if (pokemon.lastSkill && pokemon.lastSkill !== 'Struggle' && !pokemon.skills.some(skill => skill.name === pokemon.lastSkill)) {
            delete pokemon.lastSkill;
        }
    }
    evolve(pokemon, result) {
        let evolved = false;
        let targetId = (0, evolution_1.nextEvolution)(pokemon.id, pokemon.level, pokemon.uid, this.species);
        while (targetId !== undefined) {
            const target = this.species.find(entry => entry.id === targetId);
            const previousName = pokemon.name;
            pokemon.id = target.id;
            pokemon.name = target.name;
            pokemon.exp = target.exp;
            this.log(`${previousName} evolved into ${pokemon.name}!`, result, true);
            evolved = true;
            targetId = (0, evolution_1.nextEvolution)(pokemon.id, pokemon.level, pokemon.uid, this.species);
        }
        if (evolved) {
            this.refreshPokemon(pokemon, result);
        }
        return evolved;
    }
    awardXp(pokemon, amount, result) {
        const before = pokemon.level;
        pokemon.experience = Math.min(experienceAtLevel(100), pokemon.experience + amount);
        pokemon.level = levelForExperience(pokemon.experience);
        if (pokemon.level > before) {
            this.log(`${pokemon.name} grew to level ${pokemon.level}!`, result, true);
            if (!this.evolve(pokemon, result)) {
                this.refreshPokemon(pokemon, result);
            }
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
        if (!this.state.encounter) {
            this.active.hp = this.active.maxHp;
            this.state.encounterProgress++;
            if (this.state.encounterProgress >= Math.max(1, editsPerEncounter)) {
                this.state.encounterProgress = 0;
                const species = this.species[Math.min(this.species.length - 1, Math.floor(this.random() * this.species.length))];
                const level = Math.min(100, Math.max(1, this.active.level + Math.floor(this.random() * 5) - 2));
                const wild = makePokemon(species, level);
                this.choosePartner(wild);
                this.state.encounter = { pokemon: wild, mode, berry: false };
                result.spawned = wild.uid;
                this.log(`A wild ${wild.name} (Lv. ${wild.level}) appeared!`, result, true);
            }
        }
        return result;
    }
    bestBall() {
        const exp = this.state.encounter?.pokemon.exp || 0;
        const preferred = exp >= 200 ? 'Ultraball' : exp >= 100 ? 'Greatball' : 'Pokeball';
        return [preferred, 'Pokeball', 'Greatball', 'Ultraball'].find(ball => this.itemCount(ball) > 0);
    }
    wantsToCollect() {
        const encounter = this.state.encounter;
        return !!encounter && encounter.mode === 'auto'
            && !this.state.pokemon_boxes.some(pokemon => pokemon.id === encounter.pokemon.id)
            && !!this.bestBall();
    }
    /** Resolve one background turn; code edits only trigger encounters and award XP. */
    autoTurn() {
        const result = this.result();
        const encounter = this.state.encounter;
        if (!encounter) {
            return result;
        }
        const shouldCatch = encounter.mode === 'catch'
            || (this.wantsToCollect() && encounter.pokemon.hp <= encounter.pokemon.maxHp * 0.45);
        if (shouldCatch) {
            const ball = this.bestBall();
            if (ball) {
                if (!encounter.berry && this.itemCount('Razzberry') > 0) {
                    this.addItem('Razzberry', -1);
                    encounter.berry = true;
                    this.log(`Used a Razzberry to help catch ${encounter.pokemon.name}.`, result);
                }
                this.catchPokemon(ball, result);
                return result;
            }
            encounter.mode = 'battle';
            this.log('No balls left. Switched to battle mode.', result, true);
        }
        this.battleTurn(result);
        return result;
    }
    choosePartner(wild) {
        const score = (pokemon) => {
            const offense = (0, skills_1.skillPower)((0, skills_1.chooseSkill)(pokemon, wild.id), pokemon.id, wild.id) * (5 + pokemon.level * 2 + pokemon.exp / 40);
            const threat = (0, skills_1.skillPower)((0, skills_1.chooseSkill)(wild, pokemon.id), wild.id, pokemon.id) / pokemon.maxHp;
            return offense / (1 + threat);
        };
        const partner = [...this.state.pokemon_boxes].filter(pokemon => pokemon.hp > 0).sort((a, b) => score(b) - score(a))[0];
        if (partner) {
            this.state.activePokemonId = partner.uid;
            delete partner.lastSkill;
        }
    }
    damage(attacker, defender) {
        for (const id of Object.keys(attacker.skillCooldowns)) {
            if (attacker.skillCooldowns[id] <= 1) {
                delete attacker.skillCooldowns[id];
            }
            else {
                attacker.skillCooldowns[id]--;
            }
        }
        const skill = (0, skills_1.chooseSkill)(attacker, defender.id);
        if (skill.cooldown) {
            attacker.skillCooldowns[skill.id] = skill.cooldown + 1;
        }
        attacker.lastSkill = skill.name;
        const amount = Math.max(1, Math.floor((5 + attacker.level * 2 + attacker.exp / 40)
            * (0, skills_1.skillPower)(skill, attacker.id, defender.id) / 40 * (0.85 + this.random() * 0.3)));
        return { amount, skill };
    }
    describeSkill(attacker, defender, skill, damage) {
        const effectiveness = skill.id === 'struggle' ? 1 : (0, skills_1.typeEffectiveness)(skill.type, defender.id);
        return `${attacker.name} used ${skill.name} for ${damage} damage to ${defender.name}.${effectiveness > 1 ? ' Super effective!' : effectiveness < 1 ? ' Not very effective.' : ''}`;
    }
    finishEncounter() {
        this.state.encounter = undefined;
        this.state.pokemon_boxes.forEach(pokemon => { pokemon.hp = pokemon.maxHp; pokemon.skillCooldowns = {}; });
    }
    battleTurn(result) {
        const encounter = this.state.encounter;
        if (!encounter) {
            return;
        }
        const wild = encounter.pokemon;
        // Leave a new species catchable; the next automatic turn handles the ball.
        const attack = this.damage(this.active, wild);
        const damage = Math.min(attack.amount, wild.hp - (this.wantsToCollect() ? 1 : 0));
        wild.hp = Math.max(0, wild.hp - damage);
        this.log(this.describeSkill(this.active, wild, attack.skill, damage), result);
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
        const attack = this.damage(encounter.pokemon, this.active);
        const damage = attack.amount;
        this.active.hp = Math.max(0, this.active.hp - damage);
        this.log(this.describeSkill(encounter.pokemon, this.active, attack.skill, damage), result);
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
            this.evolve(wild, result);
            this.finishEncounter();
        }
        else {
            this.log(`${wild.name} broke free from the ${ball}.`, result, true);
            if (encounter.mode !== 'catch') {
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
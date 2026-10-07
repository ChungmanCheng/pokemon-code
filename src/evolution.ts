import rules from './data/evolution-data.json';

/** Pick an eligible evolution automatically; an individual's branch stays stable across reloads. */
export function nextEvolution(id: number, level: number, uid: string, species: readonly { id: number }[]): number | undefined {
    const options = rules.filter(rule => rule.from === id && level >= rule.level
        && species.some(entry => entry.id === rule.to));
    if (!options.length) { return undefined; }
    let branch = 0;
    for (const character of uid) { branch = (branch * 31 + character.charCodeAt(0)) >>> 0; }
    return options[branch % options.length].to;
}

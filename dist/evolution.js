"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextEvolution = void 0;
const evolution_data_json_1 = __importDefault(require("./data/evolution-data.json"));
/** Pick an eligible evolution automatically; an individual's branch stays stable across reloads. */
function nextEvolution(id, level, uid, species) {
    const options = evolution_data_json_1.default.filter(rule => rule.from === id && level >= rule.level
        && species.some(entry => entry.id === rule.to));
    if (!options.length) {
        return undefined;
    }
    let branch = 0;
    for (const character of uid) {
        branch = (branch * 31 + character.charCodeAt(0)) >>> 0;
    }
    return options[branch % options.length].to;
}
exports.nextEvolution = nextEvolution;
//# sourceMappingURL=evolution.js.map
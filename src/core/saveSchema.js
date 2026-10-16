/**
 * Save document schema. Bump `CURRENT_SCHEMA` and append a migration whenever the shape changes;
 * every migration gets a unit test with a fixture of the old shape (tests/unit/save.test.js).
 */

/** Current save schema version. */
export const CURRENT_SCHEMA = 1;

/**
 * Creates a fresh save document.
 * @param {number} [now=Date.now()]
 * @returns {object}
 */
export function createDefaultSave(now = Date.now()) {
  return {
    schema: CURRENT_SCHEMA,
    createdAt: now,
    savedAt: now,
    story: { chapter: 'prologue', mission: 'P', flags: {}, pages: [], ending: null },
    checkpoint: null,
    missions: { completed: {}, best: {} },
    progression: {
      cahaya: 0,
      skills: [],
      cosmetics: { owned: [], equipped: {} },
      achievements: {},
      lore: [],
    },
    competitive: { medals: {}, ghosts: {}, nickname: null, deletionTokens: {} },
    stats: { playSeconds: 0 },
  };
}

/**
 * Ordered migrations: `MIGRATIONS[n]` upgrades a schema-n document to schema n+1.
 * Schema 0 is the shape of pre-release development saves (before versioning).
 * @type {Array<(doc: any) => any>}
 */
export const MIGRATIONS = [
  // 0 → 1: development saves stored progress at the top level without `story`/`stats` blocks.
  (doc) => {
    const fresh = createDefaultSave(doc.savedAt ?? Date.now());
    fresh.createdAt = doc.createdAt ?? fresh.createdAt;
    if (typeof doc.chapter === 'string') fresh.story.chapter = doc.chapter;
    if (typeof doc.mission === 'string') fresh.story.mission = doc.mission;
    if (doc.flags && typeof doc.flags === 'object') fresh.story.flags = { ...doc.flags };
    if (Number.isFinite(doc.cahaya)) fresh.progression.cahaya = doc.cahaya;
    return fresh;
  },
];

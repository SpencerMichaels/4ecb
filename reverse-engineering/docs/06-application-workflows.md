# Application workflows required in a replacement

This is the functional surface recovered from the engine API and CharacterBuilder
pages. It is a domain checklist, not a recommendation to reproduce the old wizard
layout.

## Character creation and identity

- new/reset, open, light-preview open, save, save-as, and preserve/restore snapshot;
- name and descriptive details, portrait/blank portrait, gender, alignment, deity,
  languages, campaign, sources, and house-rule policy;
- race and racial choices, class/build/class features, hybrid classes, theme,
  background and background choices;
- six ability scores with point-buy cost, legality, paired bonuses, and auto-fill;
- trained skills and skill-related grants.

## Advancement

- advance one or many levels, automatic level-up, delevel, and view historical
  character state;
- resolve all newly required choices by type;
- feats, class/racial features, at-will/encounter/daily/utility powers;
- spellbooks and prepared alternates;
- power replacement, multiclass power swap, ordinary replacement, and retraining;
- paragon path and epic destiny;
- psionic power points, augmentable at-wills, and augment versions;
- Essentials and non-Essentials class behavior.

## Equipment and wealth

- browse/filter weapons, armor, gear, superior implements, magic items, item sets,
  rituals, and ritual scrolls;
- pair mundane bases with enchantments and validate the combination;
- quantity, equipped quantity, slots, alternate hand/slot, proficiency, dual
  wielding, double weapons, implements, item augments, and item-set benefits;
- customize name, weight, damage, silvering, note, and whether to show a power card;
- custom items and rituals, auto-equip, automatic magic-item selection, money and
  cost accounting.

The legacy UI routes existing item-owned selections through its **Class** pane:
`ClassPage.CreateExpanderList` registers `StockTypeMagicItem()` in
`ClassChoiceList`, then appends other existing choices to the same panel. Thus an
Armor of Resistance damage-type selection appears beside class choices even
though its provider is the equipped item. This is observed compatibility
behavior, not a recommended ownership model for the replacement UI.

## Review and output

- continuously show completeness and legality with repairable explanations;
- character summary, defenses, HP/surges, skills, feats, powers, bonuses, and
  equipment;
- power cards for every valid weapon/implement combination;
- companion, beast companion, familiar, mount/monster displays;
- journal entries and notes;
- character sheet generation and layout data;
- import/export `.dnd4e`, campaign files, and lossless legacy extensions.

## Search, filtering, and provenance

- search by name/body and browse by open-ended type;
- category, level/tier, source, campaign entitlement, legality, owned/available,
  prerequisite, and recommendation filters;
- show source, printable prerequisite, internal prerequisite result, flavor,
  description, all `specific` fields, custom/official status, and stable ID;
- explain why an option is unavailable rather than simply hiding it.

## House-rule workflows

- add/drop arbitrary records, add custom stat bonuses, and inject custom choices;
- grabbag selections outside the normal level chart;
- include custom `.part` content and bug-fix overlays;
- preserve illegal/missing legacy selections as stubs;
- mark exact occurrences and equipped items as house-ruled while continuing to
  calculate the sheet.

## Modern UX improvement boundaries

The old sequence of modal wizard pages is not part of file compatibility. A modern
UI can be non-linear and reactive if it preserves provider/level history and never
silently rewrites choices. Recommended interaction invariants are:

- every edit is a domain command and can be undone;
- derived state is recomputed transactionally and carries diagnostics;
- choices show effect previews and the reason for every eligibility decision;
- level history remains visible even in a consolidated character view;
- stale imported caches are labeled, never confused with recalculated truth.

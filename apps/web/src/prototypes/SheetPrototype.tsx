import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
import { ActionTypeIcon } from "../ActionTypeIcon";

// Deliberately synthetic. No private character, content pack, or stored state is read.
const abilities: readonly [string, string, string][] = [
  ["Strength", "18", "+4"],
  ["Constitution", "14", "+2"],
  ["Dexterity", "12", "+1"],
  ["Intelligence", "10", "+0"],
  ["Wisdom", "16", "+3"],
  ["Charisma", "19", "+4"],
];
const prototypeLevel = 8;

export function abilityCheckBonus(modifier: string, level: number): string {
  const total = Number(modifier) + Math.floor(level / 2);
  return `${total >= 0 ? "+" : ""}${total}`;
}
const skills: readonly [string, string, string, boolean][] = [
  ["Acrobatics", "DEX", "+3", false],
  ["Arcana", "INT", "+2", false],
  ["Athletics", "STR", "+11", true],
  ["Bluff", "CHA", "+6", false],
  ["Diplomacy", "CHA", "+11", true],
  ["Dungeoneering", "WIS", "+5", false],
  ["Endurance", "CON", "+9", true],
  ["Heal", "WIS", "+5", false],
  ["History", "INT", "+2", false],
  ["Insight", "WIS", "+10", true],
  ["Intimidate", "CHA", "+6", false],
  ["Nature", "WIS", "+5", false],
  ["Perception", "WIS", "+10", true],
  ["Religion", "INT", "+7", true],
  ["Stealth", "DEX", "+3", false],
  ["Streetwise", "CHA", "+6", false],
  ["Thievery", "DEX", "+3", false],
];
const reminders = [
  [
    "Stand together",
    "When you protect an adjacent ally, remember their temporary defense bonus.",
  ],
  [
    "Captain’s helm",
    "Nearby allies gain your helm’s initiative benefit. Tell them before they roll.",
  ],
  [
    "Watch the opening",
    "Check your reaction when a marked enemy moves away or attacks an ally.",
  ],
];
const encounters: readonly [string, string][] = [
  ["A Shield Between Friends", "Immediate Interrupt"],
  ["Driving Advance", "Standard Action"],
  ["Light Through the Gathering Storm", "Minor Action"],
  ["Second Wind", "Standard Action"],
  ["Guardian’s Signal", "Free Action"],
  ["Boots of the Wayfarer", "Move Action"],
];
const dailies: readonly [string, string][] = [
  ["Beacon at the Edge of Darkness", "Standard Action"],
  ["Unbroken Resolve", "Minor Action"],
  ["Cloak of Safe Passage", "Immediate Reaction"],
  ["A Promise Remembered", "No Action"],
];

function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`sp-panel ${className}`}>
      <h3>
        {icon ? <Icon name={icon} /> : null}
        {title}
      </h3>
      <div className="sp-panel-content">{children}</div>
    </section>
  );
}

function Page({
  id,
  number,
  title,
  subtitle,
  children,
}: {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <article className="sp-paper" id={id} aria-label={title}>
      <header className="sp-running-header">
        <span>
          Mara Vey <span>· Human Paladin 8</span>
        </span>
        <span>{title}</span>
      </header>
      <div className="sp-page-content">
        {id === "scratchpad" ? null : (
          <div className="sp-page-heading">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        )}
        {children}
      </div>
      <footer className="sp-page-footer">
        <span>
          Design prototype · Illustrative content, not calculated rules
        </span>
        <span>Mara Vey · {number} / 4</span>
      </footer>
    </article>
  );
}

function ReminderList() {
  return (
    <div className="sp-reminders">
      {reminders.map(([name, text]) => (
        <p key={name}>
          <strong>{name}:</strong> {text}
        </p>
      ))}
    </div>
  );
}

function Summary() {
  return (
    <Page
      id="summary"
      number={1}
      title="Character summary"
      subtitle="The numbers and reminders you need at the table."
    >
      <section className="sp-identity">
        <div className="sp-portrait" aria-label="Portrait placeholder">
          <Icon name="character" />
          <span>Portrait</span>
        </div>
        <div>
          <p className="sp-kicker">Character</p>
          <h1>Mara Vey</h1>
          <p className="sp-character-line">
            Human <span>·</span> Paladin <span>·</span> Level 8
          </p>
          <p className="sp-identity-note">
            Guardian of the Dawn · Unaligned · Player: Alex
          </p>
        </div>
      </section>
      <div className="sp-summary-grid">
        <div className="sp-column">
          <Panel title="Defenses" icon="shield">
            <div className="sp-values sp-defenses">
              {[
                ["AC", "24"],
                ["Fortitude", "21"],
                ["Reflex", "19"],
                ["Will", "23"],
                ["Saves", "+1"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Health" icon="class">
            <div className="sp-values sp-health">
              {[
                ["Maximum HP", "68"],
                ["Bloodied", "34"],
                ["Surges", "10"],
                ["Surge value", "17"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Movement & awareness" icon="footprints">
            <div className="sp-values sp-movement">
              {[
                ["Initiative", "+6"],
                ["Speed", "5"],
                ["Passive Insight", "20"],
                ["Passive Perception", "20"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="sp-inline-rule">
              <strong>Vision:</strong> Normal
            </p>
          </Panel>
          <Panel
            title="Remember in play"
            icon="feat"
            className="sp-reminder-panel"
          >
            <ReminderList />
            <p className="sp-caption">Full feature descriptions → p. 3</p>
          </Panel>
          <FeatReminders />
        </div>
        <div className="sp-column sp-skills-column">
          <Panel
            title="Abilities"
            icon="ability"
            className="sp-ability-reference"
          >
            <table className="sp-ability-table">
              <thead>
                <tr>
                  <th scope="col">Ability</th>
                  <th scope="col">Score</th>
                  <th scope="col">Modifier</th>
                  <th scope="col">+½ level</th>
                </tr>
              </thead>
              <tbody>
                {abilities.map(([name, score, modifier]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>{score}</td>
                    <td>{modifier}</td>
                    <td>{abilityCheckBonus(modifier, prototypeLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Skills" icon="skill" className="sp-skills-panel">
            <div className="sp-skill-legend">
              <span>
                <sup className="sp-trained-marker">T</sup> Trained
              </span>
              <span>Bonus</span>
            </div>
            <div className="sp-skill-columns">
              {[skills.slice(0, 9), skills.slice(9)].map((column, index) => (
                <table className="sp-skill-table" key={index}>
                  <tbody>
                    {column.map(([name, ability, total, trained]) => (
                      <tr
                        key={name}
                        aria-label={`${name}, ${trained ? "trained" : "untrained"}`}
                      >
                        <th scope="row">
                          {name}
                          {trained ? (
                            <sup
                              className="sp-trained-marker"
                              aria-hidden="true"
                            >
                              T
                            </sup>
                          ) : null}
                          <sub className="sp-skill-ability">{ability}</sub>
                        </th>
                        <td className="sp-skill-total">{total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </Panel>
          <Panel title="Languages" icon="race" className="sp-languages-panel">
            <p>Common · Dwarven · Elven</p>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function FeatReminders() {
  return (
    <section className="sp-feat-summary">
      <h3>
        Feat reminders <span>Full rules on p. 3</span>
      </h3>
      <div>
        <p>
          <strong>Steady Footing:</strong> Keep your footing when you protect an
          ally.
        </p>
        <p>
          <strong>Watchful Guardian:</strong> Remember your reaction when an
          enemy leaves.
        </p>
        <p>
          <strong>Practiced Recovery:</strong> Check the extra benefit when
          using Second Wind.
        </p>
        <p>
          <strong>Shared Resolve:</strong> Your protection can benefit nearby
          allies.
        </p>
      </div>
    </section>
  );
}

function Hearts() {
  return (
    <div
      className="sp-hearts"
      aria-label="Ten healing surge hearts to fill when spent"
    >
      {Array.from({ length: 10 }, (_, index) => (
        <span key={index}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21 3.5 12.6C-3 6.1 5.8-1 12 5.2 18.2-1 27 6.1 20.5 12.6Z" />
          </svg>
          <small>{10 - index}</small>
        </span>
      ))}
    </div>
  );
}

function Scratchpad() {
  return (
    <Page
      id="scratchpad"
      number={2}
      title="Play scratchpad"
      subtitle="Write here. Keep the reference pages clean. Replace this page when needed."
    >
      <div className="sp-session">
        <span>
          Session / date <i />
        </span>
      </div>
      <div className="sp-scratch-top">
        <Panel title="Health" icon="class">
          <div className="sp-hp-reference">
            <strong>
              68 <small>max HP</small>
            </strong>
            <span>
              Bloodied <b>34</b> <span>·</span> Surge <b>17</b>
            </span>
          </div>
          <div className="sp-hp-writing">
            <div>
              <span>Current HP</span>
            </div>
            <div>
              <span>Temporary HP</span>
            </div>
          </div>
          <div className="sp-health-trackers">
            <div>
              <p className="sp-caption">Healing surges · 10/day</p>
              <Hearts />
            </div>
            <div className="sp-death-saves">
              Death saves
              <span aria-label="Three death save markers">
                <Icon name="skull" />
                <Icon name="skull" />
                <Icon name="skull" />
              </span>
            </div>
          </div>
        </Panel>
        <Panel title="Resources" icon="circle">
          <div className="sp-action-points">
            <span>Action points</span>
            <i />
            <span>Milestone</span>
            <i />
          </div>
          <div className="sp-xp-tracker">
            <span>Experience</span>
            <i />
          </div>
        </Panel>
      </div>
      <div className="sp-scratch-grid">
        <div className="sp-column">
          <Panel title="Encounter powers" icon="power" className="sp-encounter">
            <table className="sp-usage-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sp-sr-only">Power</span>
                  </th>
                  {Array.from({ length: 6 }, (_, n) => (
                    <th scope="col" key={n}>
                      {n + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {encounters.map(([name, action]) => (
                  <tr key={name}>
                    <th scope="row">
                      <ActionTypeIcon decorative value={action} />
                      {name}
                    </th>
                    {Array.from({ length: 6 }, (_, n) => (
                      <td key={n} />
                    ))}
                  </tr>
                ))}
                <tr className="sp-shared-resource">
                  <th scope="row">
                    <span>Channel Divinity</span>
                    <div className="sp-shared-power">
                      <ActionTypeIcon decorative value="Standard Action" />
                      Radiant Rebuke
                    </div>
                    <div className="sp-shared-power">
                      <ActionTypeIcon decorative value="Minor Action" />
                      Restoring Light
                    </div>
                  </th>
                  {Array.from({ length: 6 }, (_, n) => (
                    <td key={n} />
                  ))}
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Daily powers" icon="power" className="sp-daily">
            <div className="sp-daily-list">
              {dailies.map(([name, action]) => (
                <div key={name}>
                  <ActionTypeIcon decorative value={action} />
                  <span>{name}</span>
                  <span className="sp-use-box" />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Treasure & consumables" icon="item">
            <div className="sp-writing-lines sp-treasure" />
          </Panel>
        </div>
        <div className="sp-column">
          <Panel title="Quick reference" icon="dices">
            <div className="sp-quick-stats">
              <p>
                <strong>24</strong> AC <span>21 Fort · 19 Ref · 23 Will</span>
              </p>
              <p>
                <strong>+6</strong> Initiative <span>Speed 5</span>
              </p>
              <p>
                <strong>20</strong> Passive Insight & Perception
              </p>
            </div>
            <table className="sp-attack-index">
              <thead>
                <tr>
                  <th>Attack</th>
                  <th>Bonus</th>
                  <th>Damage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Longsword</td>
                  <td>+12</td>
                  <td>1d8+6</td>
                </tr>
                <tr>
                  <td>Radiant Strike</td>
                  <td>+12</td>
                  <td>2d8+6</td>
                </tr>
              </tbody>
            </table>
            <p className="sp-caption">
              Equipped weapon · full powers on separate cards.
            </p>
          </Panel>
          <Panel title="Remember in play" icon="feat">
            <ReminderList />
          </Panel>
          <Panel title="Conditions & temporary effects" icon="edit">
            <div className="sp-writing-lines sp-conditions" />
          </Panel>
        </div>
      </div>
    </Page>
  );
}

const featureCards: readonly {
  name: string;
  type: string;
  icon: IconName;
  intro?: string;
  paragraphs: readonly [string, string][];
}[] = [
  {
    name: "Stand Together",
    type: "Class feature",
    icon: "class",
    intro: "Your presence helps your companions hold the line.",
    paragraphs: [
      [
        "Benefit",
        "When you protect an adjacent ally, that ally gains a temporary bonus to defenses against the next attack. The benefit ends when the protection is used or you move away.",
      ],
      [
        "Remember",
        "Tell the affected player. This conditional benefit is not included in their printed defense totals.",
      ],
    ],
  },
  {
    name: "Steady Footing",
    type: "Feat",
    icon: "feat",
    paragraphs: [
      ["Prerequisite", "Trained in Athletics"],
      [
        "Benefit",
        "When an effect would move you while you are adjacent to an ally you protect, you can reduce the movement. If this prevents the movement entirely, you remain in your original square.",
      ],
      [
        "Special",
        "This benefit does not allow you to ignore other effects of the triggering attack.",
      ],
    ],
  },
  {
    name: "A Promise Kept Through the Longest Night",
    type: "Class feature · selected option",
    icon: "class",
    paragraphs: [
      [
        "Benefit",
        "Choose an ally when you finish an extended rest. While you can see that ally, you can direct the additional benefit of your protective powers to them when the power permits it.",
      ],
      [
        "Changing the choice",
        "Choose a different ally after your next extended rest. Record the current choice on the play scratchpad.",
      ],
    ],
  },
  {
    name: "Watchful Guardian",
    type: "Feat",
    icon: "feat",
    paragraphs: [
      [
        "Benefit",
        "When an enemy you are watching leaves an adjacent square or attacks another creature, check whether your reaction can interrupt it. Resolve that reaction before continuing the triggering action if it is an interrupt.",
      ],
      [
        "Limit",
        "You still obey the normal limits on immediate actions. This feat does not provide an additional action.",
      ],
    ],
  },
  {
    name: "Practiced Recovery",
    type: "Feat",
    icon: "feat",
    paragraphs: [
      [
        "Benefit",
        "When you use Second Wind, you can also end one eligible temporary effect affecting you. Choose the effect when you spend the surge.",
      ],
      [
        "Special",
        "The additional benefit does not change the action required by Second Wind or restore an expended use of the power.",
      ],
    ],
  },
  {
    name: "Human Adaptability",
    type: "Racial trait",
    icon: "race",
    paragraphs: [
      [
        "Benefit",
        "Your selected additional training is already reflected in the skill totals on the summary page. The chosen skill remains listed here so you can trace the source of that training.",
      ],
      ["Selection", "Diplomacy"],
    ],
  },
];

function FeatureGroup({
  title,
  cards,
}: {
  title: string;
  cards: readonly (typeof featureCards)[number][];
}) {
  return (
    <section className="sp-feature-group">
      <h3>{title}</h3>
      <div className="sp-column">
        {cards.map((card) => (
          <section className="sp-feature-card" key={card.name}>
            <header>
              <Icon name={card.icon} />
              <h4>{card.name}</h4>
            </header>
            <div className="sp-feature-category">{card.type}</div>
            <div className="sp-feature-body">
              {card.intro ? <p className="sp-flavor">{card.intro}</p> : null}
              {card.paragraphs.map(([label, text]) => (
                <p key={label}>
                  <strong>{label}:</strong> {text}
                </p>
              ))}
            </div>
            <footer>Illustrative rules · Layout sample</footer>
          </section>
        ))}
      </div>
    </section>
  );
}

function FeatureReference() {
  return (
    <Page
      id="features"
      number={3}
      title="Features & feats"
      subtitle="Full rules, not just the reminder. Variable-height reference cards, not cut-out cards."
    >
      <div className="sp-feature-columns">
        <div className="sp-column">
          <FeatureGroup
            title="Class features"
            cards={featureCards.filter((card) =>
              card.type.startsWith("Class feature"),
            )}
          />
          <FeatureGroup
            title="Racial traits"
            cards={featureCards.filter((card) => card.type === "Racial trait")}
          />
        </div>
        <FeatureGroup
          title="Feats"
          cards={featureCards.filter((card) => card.type === "Feat")}
        />
      </div>
      <div className="sp-reference-note">
        <Icon name="book" />
        <p>
          Descriptions continue onto additional pages as needed. No shortened
          rules, tiny text, or fixed-height feature boxes.
        </p>
      </div>
    </Page>
  );
}

const powerLevels: Readonly<Record<string, string>> = {
  "Radiant Strike": "Level 1",
  "Hold the Line": "Level 1",
  "A Shield Between Friends": "Level 3",
  "Driving Advance": "Level 1",
  "Light Through the Gathering Storm": "Level 7",
  "Second Wind": "Basic",
  "Guardian’s Signal": "Class feature",
  "Boots of the Wayfarer": "Item",
  "Radiant Rebuke": "Class feature",
  "Restoring Light": "Class feature",
  "Beacon at the Edge of Darkness": "Level 5",
  "Unbroken Resolve": "Level 2",
  "Cloak of Safe Passage": "Item",
  "A Promise Remembered": "Racial",
};

function EquipmentRecord() {
  return (
    <Page
      id="record"
      number={4}
      title="Equipment & character record"
      subtitle="What you carry, what you can do, and who you are."
    >
      <div className="sp-record-grid">
        <div className="sp-column">
          <Panel title="Equipped by slot" icon="item">
            <table className="sp-equipment">
              <tbody>
                {[
                  ["Main hand", "Dawnwatch Longsword +2"],
                  ["Off hand", "Heavy Shield"],
                  ["Head", "Captain’s Helm"],
                  ["Neck", "Cloak of Safe Passage +2"],
                  ["Body", "Dawnforged Plate +2"],
                  ["Arms", "Bracers of Steadiness"],
                  ["Hands", "Gloves of the Guiding Light"],
                  ["Waist", "—"],
                  ["Feet", "Boots of the Wayfarer"],
                  ["Ring 1", "Silver Signet"],
                  ["Ring 2", "—"],
                ].map(([slot, name]) => (
                  <tr key={slot}>
                    <th scope="row">{slot}</th>
                    <td>{name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Carried equipment" icon="item">
            <table className="sp-equipment">
              <tbody>
                {[
                  ["Javelin", "×3"],
                  ["Healing draught", "×2"],
                  ["Adventurer’s kit", "×1"],
                  ["Rope, 50 ft", "×1"],
                ].map(([name, quantity]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td>{quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sp-inline-rule">
              <strong>Money:</strong> 84 gp · 12 sp · 6 cp
            </p>
          </Panel>
          <Panel title="Advancement" icon="level">
            <p>
              Level <strong>8</strong> <span>·</span> Experience{" "}
              <strong>14,500</strong>
            </p>
            <p className="sp-caption">Next level: 16,500 XP</p>
          </Panel>
          <Panel title="Appearance & personality" icon="character">
            <p>
              Mara wears a weathered blue travelling cloak over carefully
              maintained armor. A small copper lantern hangs from her pack.
            </p>
            <p>
              Patient with strangers, stubborn with authority. She keeps
              promises literally and remembers the names of people who helped
              her.
            </p>
          </Panel>
        </div>
        <div className="sp-column">
          <Panel title="Power index" icon="power">
            <div className="sp-power-index">
              {[
                ["At-Will", ["Radiant Strike", "Hold the Line"]],
                [
                  "Encounter",
                  [
                    ...encounters.map(([name]) => name),
                    "Radiant Rebuke",
                    "Restoring Light",
                  ],
                ],
                ["Daily", dailies.map(([name]) => name)],
              ].map(([usage, names]) => (
                <section
                  key={String(usage)}
                  className={`sp-index-group sp-${String(usage).toLowerCase()}`}
                >
                  <h4>{usage}</h4>
                  {(names as string[]).map((name) => (
                    <p key={name}>
                      <span>{name}</span>
                      <small>{powerLevels[name]}</small>
                    </p>
                  ))}
                </section>
              ))}
            </div>
            <p className="sp-caption">
              Includes item powers. Full text on the physical cards.
            </p>
          </Panel>
          <Panel title="Companions & connections" icon="companion">
            <p>
              <strong>Thistle:</strong> A patient pack mule with an unfortunate
              interest in unattended maps.
            </p>
            <p>
              <strong>The Lantern Road:</strong> Mara’s former company. She
              still carries their seal and searches for news of its missing
              quartermaster.
            </p>
          </Panel>
          <Panel title="Personal notes" icon="edit">
            <p>
              Return the brass key to the keeper at Northbridge. Ask about the
              abandoned watchtower before leaving town.
            </p>
            <div className="sp-writing-lines sp-record-notes" />
          </Panel>
        </div>
      </div>
    </Page>
  );
}

export function SheetPrototype() {
  const [paper, setPaper] = useState("letter");
  const [monochrome, setMonochrome] = useState(false);
  return (
    <div
      className={`sp-prototype sp-paper-${paper}${monochrome ? " sp-monochrome" : ""}`}
    >
      <div className="sp-toolbar">
        <div>
          <strong>Character sheet · design study</strong>
          <span>
            Isolated prototype · sample content · no character data changed
          </span>
        </div>
        <nav aria-label="Prototype pages">
          <a href="#summary">Summary</a>
          <a href="#scratchpad">Scratchpad</a>
          <a href="#features">Features</a>
          <a href="#record">Equipment & record</a>
        </nav>
        <div className="sp-controls">
          <label>
            Paper{" "}
            <select
              value={paper}
              onChange={(event) => setPaper(event.currentTarget.value)}
            >
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={monochrome}
              onChange={(event) => setMonochrome(event.currentTarget.checked)}
            />
            Monochrome
          </label>
          <button onClick={() => window.print()}>
            <Icon name="sheet" />
            Print / save PDF
          </button>
        </div>
      </div>
      <main className="sp-canvas">
        <Summary />
        <Scratchpad />
        <FeatureReference />
        <EquipmentRecord />
      </main>
    </div>
  );
}

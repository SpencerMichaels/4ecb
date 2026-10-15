import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CharacterPortrait } from "@4ecb/character-domain";
import type {
  CharacterSheetModel,
  SheetCard,
  SheetPowerVariant,
  SheetValue,
} from "@4ecb/sheet-model";
import { Icon, type IconName } from "./Icon";
import { ActionTypeIcon } from "./ActionTypeIcon";
import { Prose, ProseBlocks, proseBlocks, type ProseBlock } from "./Prose";
import { printItemPower } from "./print-item-presentation";
import "./sheet-overview.css";

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
function Paper({
  name,
  title,
  page,
  source,
  children,
  pageRef,
}: {
  name: string;
  title: string;
  page: number | string;
  source: string;
  children: ReactNode;
  pageRef?: React.RefObject<HTMLElement | null>;
}) {
  const localRef = useRef<HTMLElement>(null);
  const ref = pageRef ?? localRef;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => {
      if (!element.clientHeight) return;
      element.dataset.overviewOverflow = String(
        element.querySelector(".sp-page-content")!.getBoundingClientRect()
          .bottom >
          element.querySelector(".sp-page-footer")!.getBoundingClientRect()
            .top -
            8,
      );
    };
    const observer = new ResizeObserver(check);
    observer.observe(element);
    observer.observe(element.querySelector(".sp-page-content")!);
    check();
    return () => observer.disconnect();
  }, [ref]);
  return (
    <article className="sp-paper ov-paper" ref={ref} aria-label={title}>
      <header className="sp-running-header">
        <span>{name}</span>
        <span>{title}</span>
      </header>
      <div className="sp-page-content">{children}</div>
      <footer className="sp-page-footer">
        <span>
          {source === "authoritative-evaluation"
            ? "Character reference"
            : source === "native-empty"
              ? "Incomplete character · no evaluated rules"
              : "Legacy cache · verify missing rules and values"}
        </span>
        <span>
          {name} · {page}
        </span>
      </footer>
    </article>
  );
}
const find = (values: readonly SheetValue[], label: string) =>
  values.find((value) => value.label.toLowerCase() === label.toLowerCase())
    ?.value ?? "—";
const signedBonus = (value: string) =>
  /^\d+(?:\.\d+)?$/.test(value.trim()) && Number(value) > 0
    ? `+${value.trim()}`
    : value;
const featureGroups: Readonly<Record<string, string>> = {
  "Class Feature": "Class features",
  "Racial Trait": "Racial traits",
  Feat: "Feats",
  "Paragon Path": "Paragon paths",
  "Epic Destiny": "Epic destinies",
};
const groupName = (name: string) => featureGroups[name] ?? name;
const abilityKey: Readonly<Record<string, string>> = {
  Strength: "STR",
  Constitution: "CON",
  Dexterity: "DEX",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHA",
};
function basicAttackCell(variant: SheetPowerVariant) {
  return variant.attacks === undefined
    ? variant
    : variant.attacks.find(
        (attack) => attack.ordinal === 1 && attack.eligible !== false,
      );
}
function averageDamage(expression: string | undefined): number {
  const compact = expression?.replace(/\s+/g, "") ?? "";
  if (!/^[+-]?(?:\d+d\d+|\d+)(?:[+-](?:\d+d\d+|\d+))*$/i.test(compact))
    return -Infinity;
  return (compact.match(/[+-]?(?:\d+d\d+|\d+)/gi) ?? []).reduce((sum, term) => {
    const dice = /^([+-]?\d+)d(\d+)$/i.exec(term);
    return (
      sum +
      (dice ? (Number(dice[1]) * (Number(dice[2]) + 1)) / 2 : Number(term))
    );
  }, 0);
}
function compareBasicAttacks(
  a: { attack?: string; damage?: string },
  b: { attack?: string; damage?: string },
) {
  const bonus = (value: string | undefined) =>
    /^[+-]?\d+/.test(value ?? "")
      ? Number(value!.match(/^[+-]?\d+/)![0])
      : -Infinity;
  const attackA = bonus(a.attack),
    attackB = bonus(b.attack);
  if (attackA !== attackB) return attackA > attackB ? -1 : 1;
  const damageA = averageDamage(a.damage),
    damageB = averageDamage(b.damage);
  return damageA === damageB ? 0 : damageA > damageB ? -1 : 1;
}
function basicAttackVariants(power: SheetCard) {
  const ranged = /^ranged basic attack$/i.test(power.name.trim());
  return [...(power.variants ?? [])]
    .filter(
      (variant) =>
        (!ranged || !/^unarmed$/i.test(variant.equipmentName.trim())) &&
        (variant.basicAttackTypes === undefined ||
          variant.basicAttackTypes.includes(ranged ? "ranged" : "melee")),
    )
    .sort((a, b) =>
      compareBasicAttacks(basicAttackCell(a) ?? {}, basicAttackCell(b) ?? {}),
    );
}
export function overviewBasicAttackRows(
  model: CharacterSheetModel,
  variantLimit = Infinity,
) {
  return model.powers
    .filter((power) => /^(melee|ranged) basic attack$/i.test(power.name.trim()))
    .flatMap((power) => {
      const ranged = /^ranged/i.test(power.name.trim());
      const variants = basicAttackVariants(power);
      const visible = variants.slice(0, variantLimit);
      const rows = visible.map((variant) => {
        const cell =
          variant.attacks === undefined
            ? variant
            : variant.attacks.find((attack) => attack.ordinal === 1);
        const eligible =
          cell !== undefined &&
          !("eligible" in cell && cell.eligible === false);
        return {
          id: `${power.id ?? power.name}:${variant.id}`,
          ranged,
          weapon: variant.equipmentName,
          attack:
            eligible && !cell.attack?.includes("Unknown")
              ? (cell.attack?.match(/^[+-]?\d+/)?.[0] ?? "—")
              : "—",
          damage: eligible
            ? (cell.damage?.replace(/\s*\+\s*/g, "+") ?? "—")
            : "—",
        };
      });
      if (!variants.length && !power.variants?.length)
        rows.push({
          id: power.id ?? power.name,
          ranged,
          weapon: "Unspecified weapon",
          attack: power.attack?.match(/^[+-]?\d+/)?.[0] ?? "—",
          damage: power.damage ?? "—",
        });
      return rows;
    })
    .sort(compareBasicAttacks);
}
function BasicAttacks({
  model,
  variantLimit = 2,
}: {
  model: CharacterSheetModel;
  variantLimit?: number;
}) {
  const rows = overviewBasicAttackRows(model, variantLimit);
  const hasMore = rows.length < overviewBasicAttackRows(model).length;
  return (
    <Panel title="Basic attacks" icon="sword" className="sp-basic-attacks">
      {rows.length ? (
        <table
          className="ov-basic-table"
          aria-label="Basic attack weapon calculations"
        >
          <thead>
            <tr>
              <th scope="col">Weapon</th>
              <th scope="col">Attack</th>
              <th scope="col">Damage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className="ov-basic-weapon">
                    <Icon
                      name={
                        /^unarmed$/i.test(row.weapon.trim())
                          ? "fist"
                          : row.ranged
                            ? "bow-arrow"
                            : "sword"
                      }
                    />
                    <span className="sp-sr-only">
                      {row.ranged ? "Ranged" : "Melee"}:{" "}
                    </span>
                    <span>{row.weapon}</span>
                  </span>
                </th>
                <td>{row.attack}</td>
                <td>{row.damage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sp-caption">No basic attack calculation is available.</p>
      )}
      {hasMore ? (
        <p className="sp-caption">More weapon alternatives in references.</p>
      ) : null}
    </Panel>
  );
}
function Values({
  values,
  className,
}: {
  values: readonly (readonly [string, string])[];
  className: string;
}) {
  return (
    <div className={`sp-values ${className}`}>
      {values.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
function Reminders({ values }: { values: readonly SheetValue[] }) {
  return (
    <div className="sp-reminders">
      {values.map((entry, index) => (
        <div key={index}>
          <strong>{entry.label}:</strong> <Prose value={entry.value} />
        </div>
      ))}
    </div>
  );
}
/** Fill the measured space in priority order; an oversized entry stays in references. */
export function fittingReminderIndices(
  heights: readonly number[],
  gap: number,
  available: number,
  captionHeight: number,
): readonly number[] {
  const total = heights.reduce(
    (sum, height, index) => sum + height + (index ? gap : 0),
    0,
  );
  if (total <= available) return heights.map((_, index) => index);
  const indices: number[] = [];
  let used = 0;
  for (const [index, height] of heights.entries()) {
    const next = used + height + (indices.length ? gap : 0);
    if (next <= available - captionHeight) {
      indices.push(index);
      used = next;
    }
  }
  return indices;
}
function Summary({
  model,
  name,
  portrait,
  blankHP,
}: {
  model: CharacterSheetModel;
  name: string;
  portrait: CharacterPortrait | undefined;
  blankHP: boolean;
}) {
  const overview = model.overview!;
  const ref = useRef<HTMLElement>(null);
  const [visibleIndices, setVisibleIndices] = useState<readonly number[]>();
  const [variantLimit, setVariantLimit] = useState(2);
  const reminders =
    visibleIndices === undefined
      ? overview.reminders
      : visibleIndices.flatMap((index) =>
          overview.reminders[index] ? [overview.reminders[index]!] : [],
        );
  useLayoutEffect(() => {
    const page = ref.current;
    if (!page) return;
    let active = true;
    const check = () => {
      if (!active) return;
      if (!page.clientHeight) return;
      const footer = page.querySelector<HTMLElement>(".sp-page-footer")!;
      const basic = page.querySelector<HTMLElement>(
        ".sp-skills-column > .sp-basic-attacks",
      );
      const basicProbe = page.querySelector<HTMLElement>(
        ".ov-basic-probe .sp-basic-attacks",
      );
      if (basic && basicProbe)
        setVariantLimit(
          basicProbe.getBoundingClientRect().height <=
            footer.getBoundingClientRect().top -
              8 -
              basic.getBoundingClientRect().top
            ? 2
            : 1,
        );
      const panel = page.querySelector<HTMLElement>(".ov-summary-reminders");
      const probe = panel?.querySelector<HTMLElement>(".ov-reminder-probe");
      const list = panel?.querySelector<HTMLElement>(
        ".sp-panel-content > .sp-reminders",
      );
      if (!panel || !probe || !list) return;
      const entries = [
        ...probe.querySelector<HTMLElement>(".sp-reminders")!.children,
      ];
      const gap =
        entries.length > 1
          ? parseFloat(getComputedStyle(entries[1]!).marginTop) || 0
          : 0;
      const content = panel.querySelector<HTMLElement>(".sp-panel-content")!;
      const available =
        footer.getBoundingClientRect().top -
        8 -
        list.getBoundingClientRect().top -
        parseFloat(getComputedStyle(content).paddingBottom) -
        parseFloat(getComputedStyle(panel).borderBottomWidth);
      const caption = probe.querySelector<HTMLElement>(".sp-caption")!;
      const indices = fittingReminderIndices(
        entries.map((entry) => entry.getBoundingClientRect().height),
        gap,
        available,
        caption.getBoundingClientRect().height +
          parseFloat(getComputedStyle(caption).marginTop),
      );
      setVisibleIndices((previous) =>
        previous?.join(",") === indices.join(",") ? previous : indices,
      );
    };
    const observer = new ResizeObserver(check);
    observer.observe(page);
    observer.observe(page.querySelector(".sp-page-content")!);
    check();
    void document.fonts.ready.then(check);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [model]);
  return (
    <Paper
      name={name}
      title="Character summary"
      page={1}
      source={model.source}
      pageRef={ref}
    >
      <section className="sp-identity">
        {portrait ? (
          <div className="sp-portrait">
            <img src={portrait.renderedDataUrl} alt={`${name} portrait`} />
          </div>
        ) : null}
        <div>
          <h1>{name}</h1>
          <p className="sp-character-line">
            {model.identity
              .filter((entry) =>
                ["Race", "Class", "Level"].includes(entry.label),
              )
              .map((entry) =>
                entry.label === "Level" ? `Level ${entry.value}` : entry.value,
              )
              .join(" · ")}
          </p>
          <p className="sp-identity-note">
            {model.identity
              .filter((entry) =>
                ["Player", "ParagonPath", "EpicDestiny", "Company"].includes(
                  entry.label,
                ),
              )
              .map((entry) => entry.value)
              .join(" · ")}
          </p>
        </div>
      </section>
      <div className="sp-summary-grid">
        <div className="sp-column">
          <Panel title="Defenses" icon="shield">
            <Values
              className="sp-defenses"
              values={[
                ["AC", find(model.defenses, "AC")],
                ["Fortitude", find(model.defenses, "Fortitude")],
                ["Reflex", find(model.defenses, "Reflex")],
                ["Will", find(model.defenses, "Will")],
                ["Saves", overview.saves],
              ]}
            />
          </Panel>
          <Panel title="Health" icon="class">
            <Values
              className="sp-health"
              values={[
                [
                  "Maximum HP",
                  blankHP ? "" : find(model.resources, "Hit Points"),
                ],
                ["Bloodied", overview.bloodied],
                ["Surges", find(model.resources, "Healing Surges")],
                ["Surge value", find(model.resources, "Healing Surge Value")],
              ]}
            />
          </Panel>
          {overview.reminders.length ? (
            <Panel
              title="Remember in play"
              icon="feat"
              className="ov-summary-reminders"
            >
              <Reminders values={reminders} />
              {reminders.length < overview.reminders.length ? (
                <p className="sp-caption">
                  {overview.reminders.length - reminders.length} more reminders
                  in references.
                </p>
              ) : null}
              <div className="ov-reminder-probe" aria-hidden="true">
                <Reminders values={overview.reminders} />
                <p className="sp-caption">
                  {overview.reminders.length} more reminders in references.
                </p>
              </div>
            </Panel>
          ) : null}
        </div>
        <div className="sp-column sp-skills-column">
          <div className="ov-abilities-movement">
            <Panel
              title="Movement"
              icon="footprints"
              className="ov-movement-panel"
            >
              <Values
                className="ov-movement-values"
                values={[
                  [
                    "Initiative",
                    signedBonus(find(model.resources, "Initiative")),
                  ],
                  ["Speed", find(model.resources, "Speed")],
                ]}
              />
            </Panel>
            <Panel
              title="Abilities"
              icon="ability"
              className="sp-ability-reference"
            >
              <table className="sp-ability-table">
                <thead>
                  <tr>
                    <th scope="col" colSpan={2}>
                      Ability
                    </th>
                    <th scope="col">Modifier</th>
                    <th scope="col">+½ level</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.abilities.map((ability) => (
                    <tr key={ability.name}>
                      <td className="ov-ability-score">{ability.score}</td>
                      <th scope="row">
                        <abbr title={ability.name}>
                          {abilityKey[ability.name] ?? ability.name}
                        </abbr>
                      </th>
                      <td>{ability.modifier}</td>
                      <td>{ability.check}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
          <Panel title="Skills" icon="skill" className="sp-skills-panel">
            <div className="sp-skill-columns">
              {[overview.skills.slice(0, 9), overview.skills.slice(9)].map(
                (skills, index) => (
                  <table className="sp-skill-table" key={index}>
                    <tbody>
                      {skills.map((skill) => {
                        const passive = /^(?:Insight|Perception)$/.test(
                          skill.name,
                        )
                          ? find(model.senses, `Passive ${skill.name}`)
                          : undefined;
                        return (
                          <tr key={skill.name}>
                            <th scope="row">
                              {skill.name}
                              {skill.trained ? (
                                <sup
                                  className="sp-trained-marker"
                                  aria-label="Trained"
                                >
                                  T
                                </sup>
                              ) : null}
                              <sub className="sp-skill-ability">
                                {skill.ability}
                              </sub>
                            </th>
                            <td
                              className={`sp-skill-total${passive === undefined ? "" : " has-passive"}`}
                            >
                              {skill.bonus}
                              {passive === undefined ? null : (
                                <>
                                  {" "}
                                  <span className="ov-passive-value">
                                    ({passive})
                                  </span>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {index === 1 ? (
                        <tr>
                          <td colSpan={2} className="sp-training-key">
                            <sup className="sp-trained-marker">T</sup>: trained
                          </td>
                        </tr>
                      ) : null}
                    </tfoot>
                  </table>
                ),
              )}
            </div>
            {overview.vision ? (
              <p className="sp-inline-rule">
                <strong>Vision:</strong> {overview.vision}
              </p>
            ) : null}
          </Panel>
          <Panel title="Languages" icon="race">
            <p>
              {model.features
                .find((group) => group.group === "Language")
                ?.entries.map((entry) => entry.label)
                .join(" · ") || "Not recorded"}
            </p>
          </Panel>
          <BasicAttacks model={model} variantLimit={variantLimit} />
          <div className="ov-basic-probe" aria-hidden="true">
            <BasicAttacks model={model} />
          </div>
        </div>
      </div>
    </Paper>
  );
}

export interface TrackingRow {
  id: string;
  name: string;
  action: string;
  usage: string;
  group?: string;
}
export function overviewTrackingRows(
  model: CharacterSheetModel,
): readonly TrackingRow[] {
  const powers = model.powers.map((power) => ({
    id: power.id ?? power.name,
    name: power.name,
    action: power.actionType ?? "",
    usage: power.usage ?? "",
    ...(/(?:^|,)\s*Channel Divinity\s*(?:,|$)/i.test(power.keywords ?? "")
      ? { group: "Channel Divinity" }
      : {}),
  }));
  const items = (model.overview?.inventory ?? []).flatMap((item, index) =>
    item.fields.flatMap((field, ordinal) => {
      const power = printItemPower(field);
      return !power
        ? []
        : [
            {
              id: `item:${index}:${ordinal}`,
              name: item.name,
              action: power.actionType ?? "",
              usage: power.usage ?? "",
            },
          ];
    }),
  );
  return [...powers, ...items];
}
interface UsageGroup {
  id: string;
  name: string;
  powers: readonly TrackingRow[];
}
function usageGroups(rows: readonly TrackingRow[]): UsageGroup[] {
  const groups: UsageGroup[] = [];
  for (const row of rows) {
    const existing = row.group
      ? groups.find((group) => group.name === row.group)
      : undefined;
    if (existing)
      groups[groups.indexOf(existing)] = {
        ...existing,
        powers: [...existing.powers, row],
      };
    else
      groups.push({
        id: row.group ?? row.id,
        name: row.group ?? "",
        powers: [row],
      });
  }
  return groups;
}
function EncounterTable({ groups }: { groups: readonly UsageGroup[] }) {
  return (
    <Panel title="Encounter powers" icon="power" className="sp-encounter">
      <table className="sp-usage-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sp-sr-only">Power</span>
            </th>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <th scope="col" key={n}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id}>
              <th scope="row">
                {group.name ? <strong>{group.name}</strong> : null}
                {group.powers.map((power) => (
                  <div className="sp-shared-power" key={power.id}>
                    <ActionTypeIcon decorative value={power.action} />
                    {power.name}
                  </div>
                ))}
              </th>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <td key={n} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
function DailyList({ rows }: { rows: readonly TrackingRow[] }) {
  return (
    <Panel title="Daily powers" icon="power" className="sp-daily">
      <div className="sp-daily-list">
        {rows.map((power) => (
          <div key={power.id}>
            <ActionTypeIcon decorative value={power.action} />
            <span>{power.name}</span>
            <span className="sp-use-box" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
function Hearts({ count }: { count: string }) {
  const number = /^\d+$/.test(count) ? Number(count) : undefined;
  return number === undefined ? (
    <p>Surges: {count}</p>
  ) : (
    <div className="sp-hearts ov-hearts">
      {Array.from({ length: Math.min(number, 100) }, (_, i) => (
        <span key={i}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21 3.5 12.6C-3 6.1 5.8-1 12 5.2 18.2-1 27 6.1 20.5 12.6Z" />
          </svg>
          <small>{number - i}</small>
        </span>
      ))}
      {number > 100 ? <span>+{number - 100}</span> : null}
    </div>
  );
}
function Scratchpad({
  model,
  name,
  blankHP,
}: {
  model: CharacterSheetModel;
  name: string;
  blankHP: boolean;
}) {
  const rows = overviewTrackingRows(model);
  const encounter = usageGroups(
    rows.filter((row) => /^encounter/i.test(row.usage)),
  );
  const daily = rows.filter((row) => /^daily/i.test(row.usage));
  const [counts, setCounts] = useState({ encounter: 7, daily: 4 });
  const pageRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const check = () => {
      if (!page.clientHeight) return;
      const overflow =
        page.querySelector(".sp-page-content")!.getBoundingClientRect().bottom >
        page.querySelector(".sp-page-footer")!.getBoundingClientRect().top - 8;
      if (overflow && (counts.encounter > 2 || counts.daily > 1))
        setCounts((count) =>
          count.encounter > 2
            ? { ...count, encounter: count.encounter - 1 }
            : { ...count, daily: count.daily - 1 },
        );
      page.dataset.overviewOverflow = String(overflow);
    };
    const observer = new ResizeObserver(check);
    observer.observe(page);
    check();
    return () => observer.disconnect();
  }, [model, counts]);
  const extraEncounter = encounter.slice(counts.encounter),
    extraDaily = daily.slice(counts.daily);
  const extraPages = Math.max(
    Math.ceil(extraEncounter.length / 5),
    Math.ceil(extraDaily.length / 8),
  );
  return (
    <>
      <Paper
        name={name}
        title="Play scratchpad"
        page={2}
        source={model.source}
        pageRef={pageRef}
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
                {blankHP ? "" : find(model.resources, "Hit Points")}{" "}
                <small>max HP</small>
              </strong>
              <span>
                Bloodied <b>{model.overview!.bloodied}</b> · Surge{" "}
                <b>{find(model.resources, "Healing Surge Value")}</b>
              </span>
            </div>
            <div className="sp-hp-writing">
              <div>Current HP</div>
              <div>Temporary HP</div>
            </div>
            <div className="sp-health-trackers">
              <div>
                <p className="sp-caption">
                  Healing surges · {find(model.resources, "Healing Surges")}/day
                </p>
                <Hearts count={find(model.resources, "Healing Surges")} />
              </div>
              <div className="sp-death-saves">
                Death saves
                <span>
                  {[0, 1, 2].map((n) => (
                    <Icon key={n} name="skull" />
                  ))}
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
            <EncounterTable groups={encounter.slice(0, counts.encounter)} />
            <DailyList rows={daily.slice(0, counts.daily)} />
            {extraPages ? (
              <p className="sp-caption">
                Remaining usage rows continue on the following pages.
              </p>
            ) : null}
            <Panel title="Treasure & consumables" icon="item">
              <div className="sp-writing-lines sp-treasure" />
            </Panel>
          </div>
          <div className="sp-column">
            <Panel title="Quick reference" icon="dices">
              <p>
                {model.defenses
                  .map((entry) => `${entry.label} ${entry.value}`)
                  .join(" · ")}
              </p>
              <p className="sp-inline-rule">
                Initiative {signedBonus(find(model.resources, "Initiative"))} ·
                Speed {find(model.resources, "Speed")}
              </p>
            </Panel>
            <Panel title="Remember in play" icon="feat">
              <Reminders
                values={model
                  .overview!.reminders.filter(
                    (entry) => entry.value.length < 220,
                  )
                  .slice(0, 2)}
              />
            </Panel>
            <Panel title="Conditions & temporary effects" icon="edit">
              <div className="sp-writing-lines sp-conditions" />
            </Panel>
          </div>
        </div>
      </Paper>
      {Array.from({ length: extraPages }, (_, index) => (
        <Paper
          key={index}
          name={name}
          title="Power usage · continued"
          page={`2.${index + 1}`}
          source={model.source}
        >
          <div className="sp-page-heading">
            <h2>Power usage</h2>
          </div>
          <div className="sp-record-grid">
            <EncounterTable
              groups={extraEncounter.slice(index * 5, index * 5 + 5)}
            />
            <DailyList rows={extraDaily.slice(index * 8, index * 8 + 8)} />
          </div>
        </Paper>
      ))}
    </>
  );
}

interface ReferencePart {
  label?: string;
  block: ProseBlock;
}
export interface ReferenceEntry {
  id: string;
  name: string;
  group: string;
  source: string;
  parts: readonly ReferencePart[];
  continued?: boolean;
}
/** Split prose only for layout. Every word, list item and table row remains. */
export function referenceParts(value: string, label?: string): ReferencePart[] {
  const blocks = proseBlocks(value).flatMap<ProseBlock>((block) => {
    if (block.kind === "paragraph" && block.text.split(/\s+/).length > 80) {
      const words = block.text.split(/\s+/);
      return Array.from({ length: Math.ceil(words.length / 80) }, (_, i) => ({
        kind: "paragraph" as const,
        text: words.slice(i * 80, i * 80 + 80).join(" "),
      }));
    }
    if (block.kind === "table" && block.rows.length > 4)
      return Array.from(
        { length: Math.ceil(block.rows.length / 4) },
        (_, i) => ({ ...block, rows: block.rows.slice(i * 4, i * 4 + 4) }),
      );
    if (block.kind === "list")
      return block.items.flatMap((item, index) => {
        const words = item.split(/\s+/);
        return Array.from(
          { length: Math.ceil(words.length / 80) },
          (_, chunk) =>
            chunk === 0
              ? {
                  ...block,
                  ...(block.ordered
                    ? { start: (block.start ?? 1) + index }
                    : {}),
                  items: [words.slice(0, 80).join(" ")],
                }
              : {
                  kind: "paragraph" as const,
                  text: words.slice(chunk * 80, chunk * 80 + 80).join(" "),
                },
        );
      });
    return [block];
  });
  return blocks.map((block, index) => ({
    ...(!index && label ? { label } : {}),
    block,
  }));
}
function references(model: CharacterSheetModel): ReferenceEntry[] {
  const o = model.overview!;
  const order = [
    "Class Feature",
    "Racial Trait",
    "Feat",
    "Theme",
    "Background",
    "Paragon Path",
    "Epic Destiny",
  ];
  const result: ReferenceEntry[] = [...o.features]
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
    .map((feature) => ({
      id: feature.id,
      name: feature.name,
      group: groupName(feature.group),
      source: feature.source,
      parts: [
        ...referenceParts(feature.description),
        ...feature.fields.flatMap((field) =>
          referenceParts(field.value, field.label),
        ),
        ...(!feature.fullTextAvailable
          ? referenceParts(
              "Full rules unavailable for this content profile; the retained abbreviated description is shown.",
            )
          : []),
      ],
    }));
  if (o.reminders.length)
    result.push({
      id: "reminders",
      name: "Remember in play",
      group: "Combat reminders",
      source: "",
      parts: o.reminders.flatMap((entry) =>
        referenceParts(entry.value, entry.label),
      ),
    });
  for (const power of model.powers.filter((power) =>
    /^(melee|ranged) basic attack$/i.test(power.name.trim()),
  )) {
    const rows = basicAttackVariants(power).map((variant) => [
      variant.equipmentName,
      variant.attack ?? "—",
      variant.damage ?? "—",
    ]);
    if (rows.length)
      result.push({
        id: `basic:${power.id ?? power.name}`,
        name: power.name,
        group: "Basic attack alternatives",
        source: "",
        parts: Array.from(
          { length: Math.ceil(rows.length / 4) },
          (_, index) => ({
            block: {
              kind: "table" as const,
              headers: ["Weapon", "Attack", "Damage"],
              rows: rows.slice(index * 4, index * 4 + 4),
            },
          }),
        ),
      });
  }
  for (const equipped of [true, false]) {
    const entries = o.inventory
      .map((item) => ({
        ...item,
        quantity: equipped
          ? Math.min(item.quantity, item.equipped)
          : Math.max(0, item.quantity - item.equipped),
      }))
      .filter((item) => item.quantity > 0)
      .sort(
        (a, b) =>
          (a.slots.join("/") || find(a.fields, "Item Slot")).localeCompare(
            b.slots.join("/") || find(b.fields, "Item Slot"),
          ) || a.name.localeCompare(b.name),
      );
    if (entries.length)
      result.push({
        id: `inventory:${equipped}`,
        name: equipped ? "Equipped by slot" : "Carried equipment",
        group: "Equipment",
        source: "",
        parts: entries.map((item) => ({
          block: {
            kind: "paragraph" as const,
            text: `${item.name} ×${item.quantity}${equipped ? ` · ${item.slots.length ? item.slots.map((slot) => slot.replaceAll("-", " ")).join(" / ") : find(item.fields, "Item Slot") !== "—" ? find(item.fields, "Item Slot") : "Equipped · slot not recorded"}` : ""}`,
          },
        })),
      });
  }
  for (const usage of ["At-Will", "Encounter", "Daily", "Other"]) {
    const powers = model.powers.filter((power) =>
      usage === "Other"
        ? !/^(?:at-will|encounter|daily)/i.test(power.usage ?? "")
        : (power.usage ?? "").toLowerCase().startsWith(usage.toLowerCase()),
    );
    if (powers.length)
      result.push({
        id: `powers:${usage}`,
        name: `${usage} powers`,
        group: "Power index",
        source: "",
        parts: powers.flatMap((power) =>
          referenceParts(
            `${power.name} · ${power.actionType ?? ""} · ${find(power.fields, "Level") === "—" || !find(power.fields, "Level").trim() ? "Feature / level not specified" : `Level ${find(power.fields, "Level")}`}`,
          ),
        ),
      });
  }
  const itemPowers = overviewTrackingRows(model).filter((row) =>
    row.id.startsWith("item:"),
  );
  if (itemPowers.length)
    result.push({
      id: "item-power-index",
      name: "Item powers",
      group: "Item power index",
      source: "",
      parts: itemPowers.map((power) => ({
        block: {
          kind: "paragraph" as const,
          text: `${power.name} · ${power.usage || "Usage unspecified"} · ${power.action}`,
        },
      })),
    });
  for (const learned of model.learnedReferences)
    result.push({
      id: `learned:${learned.id ?? learned.name}`,
      name: learned.name,
      group: "Rituals & practices",
      source: learned.source ?? "",
      parts: [
        ...referenceParts(learned.description ?? ""),
        ...learned.fields.flatMap((field) =>
          referenceParts(field.value, field.label),
        ),
      ],
    });
  const xp = model.identity.find((entry) => entry.label === "Experience");
  if (xp)
    result.push({
      id: "experience",
      name: "Advancement",
      group: "Character record",
      source: "",
      parts: referenceParts(xp.value, "Experience"),
    });
  for (const note of model.notes)
    result.push({
      id: `note:${note.label}`,
      name: note.label.replace(/([a-z])([A-Z])/g, "$1 $2"),
      group: "Character record",
      source: "",
      parts: referenceParts(note.value),
    });
  return result;
}
function ReferenceCard({ entry }: { entry: ReferenceEntry }) {
  return (
    <section
      className="sp-feature-card ov-reference-card"
      data-reference-id={entry.id}
    >
      <header>
        <Icon
          name={
            entry.group === "Feats"
              ? "feat"
              : entry.group === "Equipment"
                ? "item"
                : "book"
          }
        />
        <h3>
          {entry.name}
          {entry.continued ? " (continued)" : ""}
        </h3>
      </header>
      <div className="sp-feature-category">{entry.group}</div>
      <div className="sp-feature-body">
        {entry.parts.map((part, index) => (
          <div className="ov-reference-part" key={index}>
            {part.label ? <strong>{part.label}: </strong> : null}
            <ProseBlocks blocks={[part.block]} />
          </div>
        ))}
      </div>
      {entry.source ? <footer>{entry.source}</footer> : null}
    </section>
  );
}
export function paginateReferences(
  entries: readonly ReferenceEntry[],
  measurements: ReadonlyMap<
    string,
    { height: number; overhead: number; parts: readonly number[] }
  >,
  capacity: number,
): readonly (readonly ReferenceEntry[])[] {
  if (!entries.length) return [];
  const columns: ReferenceEntry[][] = [[]];
  let used = 0;
  const place = (entry: ReferenceEntry, height: number) => {
    if (used && used + height + 16 > capacity) {
      columns.push([]);
      used = 0;
    }
    columns.at(-1)!.push(entry);
    used += height + 16;
  };
  for (const entry of entries) {
    const m = measurements.get(entry.id);
    if (!m) {
      // Preserve unmeasured content; the page overflow indicator remains explicit.
      place(entry, capacity);
      continue;
    }
    if (m.height <= capacity) {
      place(entry, m.height);
      continue;
    }
    let parts: ReferencePart[] = [],
      height = m.overhead + 25,
      partIndex = 0;
    for (const part of entry.parts) {
      const h = m.parts[partIndex++] ?? 0;
      if (parts.length && height + h > capacity) {
        place(
          {
            ...entry,
            id: `${entry.id}:part${partIndex}`,
            parts,
            continued: partIndex - parts.length > 1,
          },
          height,
        );
        parts = [];
        height = m.overhead + 25;
      }
      parts.push(part);
      height += h;
    }
    if (parts.length)
      place(
        {
          ...entry,
          id: `${entry.id}:last`,
          parts,
          continued: partIndex > parts.length,
        },
        height,
      );
  }
  return columns;
}
function Details({
  model,
  name,
}: {
  model: CharacterSheetModel;
  name: string;
}) {
  const entries = useMemo(() => references(model), [model]);
  const probe = useRef<HTMLElement>(null);
  const [columns, setColumns] = useState<
    readonly (readonly ReferenceEntry[])[]
  >([]);
  useLayoutEffect(() => {
    const element = probe.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const container =
        element.querySelector<HTMLElement>(".ov-measure-column")!;
      const capacity =
        element.querySelector(".sp-page-footer")!.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        14;
      if (capacity < 100) return;
      const measurements = new Map(
        Array.from(
          container.querySelectorAll<HTMLElement>(".ov-reference-card"),
        ).map((card) => {
          const heights = Array.from(
            card.querySelectorAll<HTMLElement>(".ov-reference-part"),
          ).map((part) => part.getBoundingClientRect().height);
          return [
            card.dataset.referenceId!,
            {
              height: card.getBoundingClientRect().height,
              overhead:
                card.getBoundingClientRect().height -
                heights.reduce((sum, h) => sum + h, 0),
              parts: heights,
            },
          ] as const;
        }),
      );
      setColumns(paginateReferences(entries, measurements, capacity));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [entries]);
  return (
    <>
      <div className="ov-measure" aria-hidden="true">
        <Paper
          name={name}
          title="Character reference"
          page=""
          source={model.source}
          pageRef={probe}
        >
          <div className="sp-page-heading">
            <h2>Character reference</h2>
          </div>
          <div className="ov-measure-column">
            {entries.map((entry) => (
              <ReferenceCard entry={entry} key={entry.id} />
            ))}
          </div>
        </Paper>
      </div>
      {Array.from({ length: Math.ceil(columns.length / 2) }, (_, index) => (
        <Paper
          key={index}
          name={name}
          title="Character reference"
          page={`R${index + 1}`}
          source={model.source}
        >
          <div className="sp-page-heading">
            <h2>Character reference</h2>
          </div>
          <div className="sp-feature-columns ov-reference-columns">
            {columns.slice(index * 2, index * 2 + 2).map((column, n) => (
              <div className="sp-column" key={n}>
                {column.map((entry) => (
                  <ReferenceCard entry={entry} key={entry.id} />
                ))}
              </div>
            ))}
          </div>
        </Paper>
      ))}
    </>
  );
}
export function SheetOverview({
  model,
  name,
  portrait,
  paper,
  monochrome,
  blankHP,
}: {
  model: CharacterSheetModel;
  name: string;
  portrait: CharacterPortrait | undefined;
  paper: "letter" | "a4";
  monochrome: boolean;
  blankHP: boolean;
}) {
  if (!model.overview) return null;
  return (
    <div
      className={`sheet-overview sp-prototype sp-paper-${paper}${monochrome ? " sp-monochrome" : ""} print-only`}
    >
      <Summary
        model={model}
        name={name}
        portrait={portrait}
        blankHP={blankHP}
      />
      <Scratchpad model={model} name={name} blankHP={blankHP} />
      <Details model={model} name={name} />
    </div>
  );
}

import {
  Children,
  isValidElement,
  useCallback,
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
import { SurgeBar } from "./SurgeBar";
import {
  paginateTracking,
  type TrackingMeasurements,
  type TrackingPage,
} from "./scratchpad-layout";
import "./sheet-overview.css";

function Panel({
  title,
  icon,
  children,
  className = "",
  headerNote,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  headerNote?: ReactNode;
}) {
  return (
    <section className={`sp-panel ${className}`}>
      <h3>
        {icon ? <Icon name={icon} /> : null}
        {title}
        {headerNote ? (
          <span className="ov-panel-note">{headerNote}</span>
        ) : null}
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
  runningHeader,
}: {
  name: string;
  title: string;
  page: number | string;
  source: string;
  children: ReactNode;
  pageRef?: React.RefObject<HTMLElement | null>;
  runningHeader?: ReactNode;
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
      {page !== 1 ? (
        <header
          className={`sp-running-header${runningHeader ? " ov-scratch-header" : ""}`}
        >
          {runningHeader ?? (
            <>
              <span>{name}</span>
              <span>{title}</span>
            </>
          )}
        </header>
      ) : null}
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
  /^\d+(?:\.\d+)?$/.test(value.trim()) ? `+${value.trim()}` : value;
const featureGroups: Readonly<Record<string, string>> = {
  "Class Feature": "Class features",
  "Racial Trait": "Racial traits",
  Feat: "Feats",
  "Paragon Path": "Paragon paths",
  "Epic Destiny": "Epic destinies",
};
const groupName = (name: string) => featureGroups[name] ?? name;
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
  referencePage,
}: {
  model: CharacterSheetModel;
  variantLimit?: number;
  referencePage?: string | undefined;
}) {
  const rows = overviewBasicAttackRows(model, variantLimit);
  const hasMore = rows.length < overviewBasicAttackRows(model).length;
  return (
    <Panel
      title="Basic attacks"
      icon="sword"
      className="sp-basic-attacks"
      headerNote={
        hasMore
          ? referencePage
            ? `More on pg ${referencePage}…`
            : "More in references…"
          : undefined
      }
    >
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
function Reminders({
  values,
  indices,
}: {
  values: readonly ReminderEntry[];
  indices?: readonly number[];
}) {
  return (
    <div className="sp-reminders">
      {values.map((entry, index) => (
        <div key={index} data-reminder-index={indices?.[index]}>
          <strong>
            {entry.label.replace(/\s*\([^()]*\)/g, "").trim() || entry.label}
          </strong>{" "}
          {entry.elements && entry.elements.length > 1 ? (
            <ul className="ov-reminder-elements">
              {entry.elements.map((element, index) => (
                <li key={index}>
                  <Prose value={element} />
                </li>
              ))}
            </ul>
          ) : (
            <Prose value={entry.value} />
          )}
        </div>
      ))}
    </div>
  );
}
type ReminderEntry = NonNullable<
  CharacterSheetModel["overview"]
>["reminders"][number];
function ReminderPanels({
  values,
  visibleIndices,
}: {
  values: readonly ReminderEntry[];
  visibleIndices?: readonly number[] | undefined;
}) {
  const categories = [
    "Class features",
    "Racial features",
    "Feats",
    "Item properties",
    "Other reminders",
  ];
  const categoryIcons: Readonly<Record<string, IconName>> = {
    "Class features": "class",
    "Racial features": "race",
    Feats: "feat",
    "Item properties": "item",
  };
  return (
    <div className="sp-column ov-reminder-panels">
      {categories.map((category) => {
        const entries = values.flatMap((entry, index) =>
          (entry.category ?? "Other reminders") === category &&
          (visibleIndices === undefined || visibleIndices.includes(index))
            ? [{ entry, index }]
            : [],
        );
        return entries.length ? (
          <Panel
            key={category}
            title={category}
            icon={categoryIcons[category] ?? "feat"}
          >
            <Reminders
              values={entries.map(({ entry }) => entry)}
              indices={entries.map(({ index }) => index)}
            />
          </Panel>
        ) : null;
      })}
    </div>
  );
}
function defensiveBonusText(
  trait: NonNullable<
    CharacterSheetModel["overview"]
  >["defensiveTraits"][number],
) {
  const numeric = /^(.+?) (\d+)(.*)$/.exec(trait.value);
  if (numeric && ["Resistance", "Vulnerability"].includes(trait.label))
    return `${trait.label === "Resistance" ? "Resist" : "Vulnerable"} ${numeric[2]} ${numeric[1]!.toLowerCase()}${numeric[3] ?? ""}`;
  if (
    /^immunit(?:y|ies)$/i.test(trait.group ?? trait.label) &&
    !/\bimmun(?:e|ity)\b/i.test(trait.value)
  )
    return `Immune to ${trait.value}`;
  if (trait.label === "Resistance / vulnerability")
    return `Resistance / vulnerability: ${trait.value}`;
  const text = ["Saving throws", "Death saves"].includes(trait.label)
    ? trait.value.replace(/\bagainst\b/gi, "vs")
    : trait.value;
  return text.replace(
    /^(\s*(?:\*\*|__|\*|_)?)(\p{Ll})/u,
    (_, prefix: string, letter: string) => prefix + letter.toUpperCase(),
  );
}
function DefensiveTraits({ model }: { model: CharacterSheetModel }) {
  const groups = new Map<
    string,
    NonNullable<CharacterSheetModel["overview"]>["defensiveTraits"][number][]
  >();
  const names: Record<string, string> = {
    resistance: "Resistances",
    resistances: "Resistances",
    vulnerability: "Vulnerabilities",
    vulnerabilities: "Vulnerabilities",
    immunity: "Immunities",
    immunities: "Immunities",
    "saving throws": "Saving throws",
    "death saves": "Saving throws",
  };
  for (const trait of model.overview?.defensiveTraits ?? []) {
    const group =
      names[(trait.group ?? trait.label).toLowerCase()] ??
      trait.group ??
      trait.label;
    groups.set(group, [...(groups.get(group) ?? []), trait]);
  }
  let rowNumber = 0;
  return (
    <table className="ov-defensive-table" aria-label="Resistances & Weaknesses">
      <colgroup>
        <col />
        <col />
      </colgroup>
      {[...groups]
        .sort(([a], [b]) => {
          const order = [
            "Resistances",
            "Immunities",
            "Vulnerabilities",
            "Saving throws",
          ];
          const rank = (value: string) =>
            order.includes(value) ? order.indexOf(value) : order.length;
          return rank(a) - rank(b);
        })
        .map(([group, traits]) => (
          <tbody key={group} aria-label={group}>
            {traits.map((trait, index) => (
              <tr
                key={index}
                className={
                  rowNumber++ % 2 === 0 ? "ov-defensive-striped" : undefined
                }
              >
                <td>
                  <Prose value={defensiveBonusText(trait)} />
                </td>
                <td>{trait.source ?? "Source unavailable"}</td>
              </tr>
            ))}
          </tbody>
        ))}
    </table>
  );
}
/** Fill measured space in priority order; remaining entries continue after page 1. */
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
export function fittingReminderGroups(
  groups: readonly {
    overhead: number;
    gap: number;
    entries: readonly { index: number; height: number }[];
  }[],
  available: number,
  captionHeight: number,
  panelGap: number,
): readonly number[] {
  const total = groups.reduce(
    (sum, group, index) =>
      sum +
      group.overhead +
      group.entries.reduce((s, entry) => s + entry.height, 0) +
      group.gap * Math.max(0, group.entries.length - 1) +
      (index ? panelGap : 0),
    0,
  );
  if (total <= available)
    return groups.flatMap((group) => group.entries.map((entry) => entry.index));
  const indices: number[] = [];
  let used = 0;
  for (const group of groups) {
    let count = 0;
    for (const entry of group.entries) {
      const cost =
        entry.height +
        (count ? group.gap : group.overhead + (indices.length ? panelGap : 0));
      if (used + cost <= available - captionHeight) {
        indices.push(entry.index);
        used += cost;
        count++;
      }
    }
  }
  return indices;
}
/** Keep a prefix on the left; overflow is an ordered suffix, never a split pane. */
export function fittingSummaryPaneCount(
  heights: readonly number[],
  available: number,
  gap: number,
): number {
  let used = 0;
  let count = 0;
  for (const height of heights) {
    const next = used + height + (count ? gap : 0);
    if (next > available) break;
    used = next;
    count++;
  }
  return count;
}
type SummaryPaneId = "defenses" | "skills" | "abilities" | "attacks" | "senses";
interface SummaryPaneProps {
  id: SummaryPaneId;
  children: ReactNode;
}
function SummaryPane({ children }: SummaryPaneProps) {
  return <>{children}</>;
}
function SummaryColumns({
  model,
  children,
  onVisibleReminders,
}: {
  model: CharacterSheetModel;
  children: ReactNode;
  onVisibleReminders: (indices: readonly number[]) => void;
}) {
  const overview = model.overview!;
  const summaryReminders = overview.summaryReminders ?? overview.reminders;
  const ref = useRef<HTMLDivElement>(null);
  const slots = new Map(
    Children.toArray(children).flatMap((child) =>
      isValidElement<SummaryPaneProps>(child) && child.props.children
        ? [[child.props.id, child.props.children] as const]
        : [],
    ),
  );
  const panes = (["senses", "skills", "abilities", "attacks"] as const).flatMap(
    (id) => (slots.has(id) ? [{ id, content: slots.get(id) }] : []),
  );
  const [leftCount, setLeftCount] = useState(4);
  const [visibleIndices, setVisibleIndices] = useState<readonly number[]>();
  const reminders =
    visibleIndices === undefined
      ? summaryReminders
      : visibleIndices.flatMap((index) =>
          summaryReminders[index] ? [summaryReminders[index]!] : [],
        );
  useLayoutEffect(() => {
    if (visibleIndices !== undefined) onVisibleReminders(visibleIndices);
  }, [visibleIndices, onVisibleReminders]);
  useLayoutEffect(() => {
    const grid = ref.current;
    const page = grid?.closest<HTMLElement>(".ov-paper");
    if (!page || !grid) return;
    let active = true;
    const check = () => {
      if (!active) return;
      if (!page.clientHeight) return;
      const footer = page.querySelector<HTMLElement>(".sp-page-footer")!;
      const left = grid.querySelector<HTMLElement>(".ov-main-column")!;
      const gap = parseFloat(getComputedStyle(left).rowGap) || 0;
      const count = fittingSummaryPaneCount(
        [
          ...grid.querySelectorAll<HTMLElement>(
            ".ov-pane-probe > .ov-flow-pane",
          ),
        ].map((pane) => pane.getBoundingClientRect().height),
        footer.getBoundingClientRect().top -
          8 -
          left.getBoundingClientRect().top,
        gap,
      );
      if (count !== Math.min(leftCount, panes.length)) {
        setLeftCount(count);
        return; // Measure reminders after React has placed the overflow panes.
      }
      const column = page.querySelector<HTMLElement>(".ov-reminders-column");
      const probe = column?.querySelector<HTMLElement>(".ov-reminder-probe");
      const panels = probe?.querySelector<HTMLElement>(".ov-reminder-panels");
      if (!column || !probe || !panels) return;
      const panelGap = parseFloat(getComputedStyle(panels).rowGap) || 0;
      const groups = [...panels.children].map((panel) => {
        const entries = [
          ...panel.querySelectorAll<HTMLElement>("[data-reminder-index]"),
        ];
        const gap =
          entries.length > 1
            ? parseFloat(getComputedStyle(entries[1]!).marginTop) || 0
            : 0;
        const heights = entries.map((entry) => ({
          index: Number(entry.dataset.reminderIndex),
          height: entry.getBoundingClientRect().height,
        }));
        return {
          entries: heights,
          gap,
          overhead:
            panel.getBoundingClientRect().height -
            heights.reduce((sum, entry) => sum + entry.height, 0) -
            gap * Math.max(0, entries.length - 1),
        };
      });
      const available =
        footer.getBoundingClientRect().top -
        8 -
        column
          .querySelector<HTMLElement>(".ov-reminder-region")!
          .getBoundingClientRect().top;
      const caption = probe.querySelector<HTMLElement>(".sp-caption")!;
      const indices = fittingReminderGroups(
        groups,
        available,
        caption.getBoundingClientRect().height +
          parseFloat(getComputedStyle(caption).marginTop) +
          (parseFloat(getComputedStyle(column).rowGap) || 0),
        panelGap,
      );
      setVisibleIndices((previous) =>
        previous?.join(",") === indices.join(",") ? previous : indices,
      );
    };
    const observer = new ResizeObserver(check);
    observer.observe(page);
    observer.observe(page.querySelector(".sp-page-content")!);
    observer.observe(grid.querySelector(".ov-pane-probe")!);
    observer.observe(
      grid.querySelector(".ov-reminder-probe > .ov-reminder-panels")!,
    );
    for (const pane of grid.querySelectorAll(".ov-pane-probe > .ov-flow-pane"))
      observer.observe(pane);
    const defenses = grid.querySelector(
      ".ov-reminders-column > .ov-defensive-traits",
    );
    if (defenses) observer.observe(defenses);
    check();
    void document.fonts.ready.then(check);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [model, children, leftCount, panes.length]);
  const renderPane = (pane: (typeof panes)[number]) => (
    <div className="ov-flow-pane" data-summary-pane={pane.id} key={pane.id}>
      {pane.content}
    </div>
  );
  return (
    <div className="sp-summary-grid ov-balanced-columns" ref={ref}>
      <div className="sp-column ov-main-column">
        {panes.slice(0, leftCount).map(renderPane)}
      </div>
      <section
        className="sp-column ov-reminders-column"
        aria-label="Resistances, weaknesses and reminders"
      >
        {slots.get("defenses")}
        {panes.slice(leftCount).map(renderPane)}
        <section className="ov-reminder-region" aria-label="Reminders">
          <ReminderPanels
            values={summaryReminders}
            visibleIndices={visibleIndices}
          />
          {reminders.length < summaryReminders.length ? (
            <p className="sp-caption">
              {summaryReminders.length - reminders.length} more reminders on
              page 2…
            </p>
          ) : null}
        </section>
        <div className="ov-reminder-probe" aria-hidden="true">
          <ReminderPanels values={summaryReminders} />
          <p className="sp-caption">
            {summaryReminders.length} more reminders on page 2…
          </p>
        </div>
      </section>
      <div className="ov-pane-probe" aria-hidden="true">
        {panes.map(renderPane)}
      </div>
    </div>
  );
}
export function fittingIdentityNameSize(
  measure: (size: number) => number,
  available: number,
  preferred = 27,
  minimum = 18,
): number {
  if (measure(preferred) <= available) return preferred;
  let low = minimum;
  let high = preferred;
  while (high - low > 0.25) {
    const size = (low + high) / 2;
    if (measure(size) <= available) low = size;
    else high = size;
  }
  return low;
}
function IdentityName({ name }: { name: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => {
      if (!element.clientWidth) return;
      const size = fittingIdentityNameSize((size) => {
        element.style.fontSize = `${size}pt`;
        return element.scrollWidth;
      }, element.clientWidth);
      element.style.fontSize = `${size}pt`;
    };
    const observer = new ResizeObserver(check);
    observer.observe(element.parentElement!);
    check();
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) check();
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [name]);
  return (
    <h1 className="ov-character-name" ref={ref} title={name}>
      {name}
    </h1>
  );
}
function Summary({
  model,
  name,
  portrait,
  blankHP,
  basicAttackPage,
  onVisibleReminders,
}: {
  model: CharacterSheetModel;
  name: string;
  portrait: CharacterPortrait | undefined;
  blankHP: boolean;
  basicAttackPage?: string | undefined;
  onVisibleReminders: (indices: readonly number[]) => void;
}) {
  const overview = model.overview!;
  return (
    <Paper name={name} title="Character summary" page={1} source={model.source}>
      <section className="sp-identity">
        {portrait ? (
          <div className="sp-portrait">
            <img src={portrait.renderedDataUrl} alt={`${name} portrait`} />
          </div>
        ) : null}
        <div className="ov-identity-name">
          <IdentityName name={name} />
          <p className="sp-character-line">
            {["Race", "Class", "Level"]
              .flatMap((label) =>
                model.identity
                  .filter((entry) => entry.label === label)
                  .map((entry) => entry.value),
              )
              .join(" ")}
          </p>
          <p className="ov-player-company">
            {["Player", "Company"]
              .map((label) =>
                model.identity
                  .find((entry) => entry.label === label)
                  ?.value.trim(),
              )
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <dl className="ov-identity-details">
          {[
            ["Theme", "Theme"],
            ["ParagonPath", "Paragon path"],
            ["EpicDestiny", "Epic destiny"],
          ].map(([field, label]) => (
            <div key={field}>
              <dt>{label}</dt>
              <dd>
                {model.identity
                  .find((entry) => entry.label === field)
                  ?.value.trim() || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="ov-numeric-band" aria-label="Combat statistics">
        <section aria-label="Defenses" className="ov-stat-group">
          <Values
            className="sp-defenses ov-band-values"
            values={[
              ["AC", find(model.defenses, "AC")],
              ["Fortitude", find(model.defenses, "Fortitude")],
              ["Reflex", find(model.defenses, "Reflex")],
              ["Will", find(model.defenses, "Will")],
              [
                "Saves",
                /^[+-]?0$/.test(overview.saves.trim()) ? "—" : overview.saves,
              ],
            ]}
          />
        </section>
        <section aria-label="Health" className="ov-stat-group">
          <Values
            className="sp-health ov-band-values"
            values={[
              ["Max HP", blankHP ? "" : find(model.resources, "Hit Points")],
              ["Bloodied", overview.bloodied],
              ["Surges", find(model.resources, "Healing Surges")],
              ["Surge HP", find(model.resources, "Healing Surge Value")],
            ]}
          />
        </section>
        <section aria-label="Initiative" className="ov-stat-group">
          <Values
            className="ov-band-values"
            values={[
              ["Initiative", signedBonus(find(model.resources, "Initiative"))],
            ]}
          />
        </section>
        <section aria-label="Speed" className="ov-stat-group">
          <Values
            className="ov-band-values"
            values={[["Speed", find(model.resources, "Speed")]]}
          />
        </section>
      </section>
      <SummaryColumns model={model} onVisibleReminders={onVisibleReminders}>
        <SummaryPane id="defenses">
          {overview.defensiveTraits?.length ? (
            <Panel
              title="Resistances & Weaknesses"
              icon="shield"
              className="ov-defensive-traits"
            >
              <DefensiveTraits model={model} />
            </Panel>
          ) : null}
        </SummaryPane>
        <SummaryPane id="senses">
          {overview.vision ? (
            <Panel title="Senses" icon="eye" className="ov-senses">
              <p>{overview.vision}</p>
            </Panel>
          ) : null}
        </SummaryPane>
        <SummaryPane id="attacks">
          <BasicAttacks model={model} referencePage={basicAttackPage} />
        </SummaryPane>
        <SummaryPane id="abilities">
          <div className="ov-ability-section">
            <Panel
              title="Abilities"
              icon="ability"
              className="sp-ability-reference"
            >
              <table className="sp-ability-table">
                <thead>
                  <tr>
                    <th scope="col" aria-label="Ability score" />
                    <th scope="col" className="ov-ability-name-heading">
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
                      <th scope="row">{ability.name}</th>
                      <td>{ability.modifier}</td>
                      <td>{ability.check}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Languages" icon="race" className="ov-languages-panel">
              <table className="ov-language-table" aria-label="Languages">
                <tbody>
                  {(
                    model.features.find((group) => group.group === "Language")
                      ?.entries ?? []
                  ).map((entry, index) => (
                    <tr key={index}>
                      <th scope="row">{entry.label}</th>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!model.features.find((group) => group.group === "Language")
                ?.entries.length ? (
                <p>Not recorded</p>
              ) : null}
            </Panel>
          </div>
        </SummaryPane>
        <SummaryPane id="skills">
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
                              {passive === undefined ? null : (
                                <>
                                  <span className="ov-passive-value">
                                    ({passive})
                                  </span>{" "}
                                </>
                              )}
                              {skill.bonus}
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
          </Panel>
        </SummaryPane>
      </SummaryColumns>
    </Paper>
  );
}

export interface TrackingRow {
  id: string;
  name: string;
  action: string;
  usage: string;
  group?: string;
  utility?: boolean;
}
export function overviewTrackingRows(
  model: CharacterSheetModel,
  compactItemNames = false,
): readonly TrackingRow[] {
  const powers = model.powers.map((power) => ({
    id: power.id ?? power.name,
    name: power.name,
    action: power.actionType ?? "",
    usage: power.usage ?? "",
    ...(power.fields.some(
      (field) =>
        field.label.trim().toLowerCase() === "power type" &&
        field.value.trim().toLowerCase() === "utility",
    )
      ? { utility: true }
      : {}),
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
              name: compactItemNames
                ? item.name
                    .replace(/\s*\((?:heroic|paragon|epic)\s+tier\)/gi, "")
                    .replace(/\s*\+\d+\b/g, "")
                    .replace(/\s{2,}/g, " ")
                    .trim()
                : item.name,
              action: power.actionType ?? "",
              usage: power.usage ?? "",
              ...(/^utility power\b/i.test(field.label.trim()) ||
              /^\s*utility power\b/i.test(field.value)
                ? { utility: true }
                : {}),
            },
          ];
    }),
  );
  return [...powers, ...items];
}
/** Keep authored metadata authoritative: an absent Attack field does not mean Utility. */
export function sortedTrackingRows(
  rows: readonly TrackingRow[],
): TrackingRow[] {
  const actionRank = (action: string): number => {
    const normalized = action.trim().toLowerCase();
    if (/^standard\b/.test(normalized)) return 0;
    if (/^move\b/.test(normalized)) return 1;
    if (/^minor\b/.test(normalized)) return 2;
    if (/^(?:free|no action)\b/.test(normalized)) return 3;
    if (/^(?:immediate|opportunity|reaction|interrupt)\b/.test(normalized))
      return 4;
    return 5;
  };
  return [...rows].sort(
    (a, b) =>
      actionRank(a.action) - actionRank(b.action) ||
      Number(Boolean(a.utility)) - Number(Boolean(b.utility)) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
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
  const columns = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <Panel title="Encounter powers" icon="power" className="sp-encounter">
      <table className="sp-usage-table" aria-label="Encounter power usage">
        <colgroup>
          <col />
          {columns.map((n) => (
            <col key={n} />
          ))}
        </colgroup>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id} data-tracking-id={group.id}>
              <th scope="row">
                {group.name ? <strong>{group.name}</strong> : null}
                {group.powers.map((power) => (
                  <div className="sp-shared-power" key={power.id}>
                    <ActionTypeIcon decorative value={power.action} />
                    {power.name}
                  </div>
                ))}
              </th>
              {columns.map((n) => (
                <td key={n}>
                  <i className="ov-encounter-box" />
                </td>
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
          <div key={power.id} data-tracking-id={power.id}>
            <ActionTypeIcon decorative value={power.action} />
            <span>{power.name}</span>
            <span className="sp-use-box" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
function TrackingPanels({
  encounter,
  daily,
}: {
  encounter: readonly UsageGroup[];
  daily: readonly TrackingRow[];
}) {
  return (
    <div
      className={`ov-tracking-panels${encounter.length && daily.length ? " has-both" : ""}`}
    >
      {encounter.length ? <EncounterTable groups={encounter} /> : null}
      {daily.length ? <DailyList rows={daily} /> : null}
    </div>
  );
}
function Scratchpad({
  model,
  name,
  blankHP,
  startPage,
}: {
  model: CharacterSheetModel;
  name: string;
  blankHP: boolean;
  startPage: number;
}) {
  const rows = useMemo(() => overviewTrackingRows(model, true), [model]);
  const encounter = useMemo(
    () =>
      usageGroups(
        sortedTrackingRows(rows.filter((row) => /^encounter/i.test(row.usage))),
      ),
    [rows],
  );
  const daily = useMemo(
    () => sortedTrackingRows(rows.filter((row) => /^daily/i.test(row.usage))),
    [rows],
  );
  const [pages, setPages] = useState<readonly TrackingPage[]>();
  const pageRef = useRef<HTMLElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const recordsRef = useRef<HTMLDivElement>(null);
  const firstProbe = useRef<HTMLDivElement>(null);
  const nextProbe = useRef<HTMLDivElement>(null);
  const nextPaper = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const page = pageRef.current;
    const first = firstProbe.current,
      next = nextProbe.current,
      paper = nextPaper.current;
    if (!page || !first || !next || !paper) return;
    let active = true;
    const measurements = (element: HTMLElement): TrackingMeasurements => {
      const panels = element.querySelector<HTMLElement>(".ov-tracking-panels")!;
      const encounterPanel =
        element.querySelector<HTMLElement>(".sp-encounter");
      const dailyPanel = element.querySelector<HTMLElement>(".sp-daily");
      const heights = (selector: string) =>
        [...element.querySelectorAll<HTMLElement>(selector)].map(
          (row) => row.getBoundingClientRect().height,
        );
      const encounter = heights(".sp-usage-table tbody > tr"),
        daily = heights(".sp-daily-list > div");
      return {
        encounter,
        daily,
        encounterOverhead:
          (encounterPanel?.getBoundingClientRect().height ?? 0) -
          encounter.reduce((a, b) => a + b, 0),
        dailyOverhead:
          (dailyPanel?.getBoundingClientRect().height ?? 0) -
          daily.reduce((a, b) => a + b, 0),
        gap: parseFloat(getComputedStyle(panels).rowGap) || 0,
        sideBySide:
          getComputedStyle(panels).gridTemplateColumns.split(" ").length > 1,
      };
    };
    const check = () => {
      if (
        !active ||
        !page.clientHeight ||
        !first.clientWidth ||
        !next.clientWidth
      )
        return;
      const caption = first.querySelector<HTMLElement>(".ov-tracking-caption")!;
      const layout = paginateTracking(
        measurements(first),
        measurements(next),
        page.querySelector(".sp-page-footer")!.getBoundingClientRect().top -
          8 -
          regionRef.current!.getBoundingClientRect().top -
          recordsRef.current!.getBoundingClientRect().height -
          parseFloat(getComputedStyle(recordsRef.current!).marginTop),
        paper.querySelector(".sp-page-footer")!.getBoundingClientRect().top -
          8 -
          next.getBoundingClientRect().top,
        caption.getBoundingClientRect().height +
          parseFloat(getComputedStyle(caption).marginTop) +
          (parseFloat(getComputedStyle(first).rowGap) || 0),
      );
      setPages((old) =>
        JSON.stringify(old) === JSON.stringify(layout) ? old : layout,
      );
    };
    const observer = new ResizeObserver(check);
    observer.observe(page);
    observer.observe(page.querySelector(".sp-page-content")!);
    observer.observe(first);
    observer.observe(next);
    observer.observe(recordsRef.current!);
    check();
    void document.fonts.ready.then(check);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [model]);
  const layout = pages ?? [
    {
      encounterStart: 0,
      encounterEnd: encounter.length,
      dailyStart: 0,
      dailyEnd: daily.length,
    },
  ];
  const first = layout[0]!;
  const identityLine = ["Race", "Class", "Level"]
    .flatMap((label) =>
      model.identity
        .filter((entry) => entry.label === label)
        .map((entry) => entry.value),
    )
    .join(" ");
  const renderTracking = (slice: TrackingPage) => (
    <TrackingPanels
      encounter={encounter.slice(slice.encounterStart, slice.encounterEnd)}
      daily={daily.slice(slice.dailyStart, slice.dailyEnd)}
    />
  );
  return (
    <>
      <Paper
        name={name}
        title="Play scratchpad"
        page={startPage}
        source={model.source}
        pageRef={pageRef}
        runningHeader={
          <>
            <span
              className="ov-scratch-header-identity"
              title={[name, identityLine].filter(Boolean).join(" · ")}
            >
              {name}
              {identityLine ? ` · ${identityLine}` : ""}
            </span>
            <span>Play scratchpad</span>
            <span className="ov-scratch-header-session">
              Session / date <i />
            </span>
          </>
        }
      >
        <div className="ov-scratch-layout ov-scratch-upper">
          <div className="sp-column ov-scratch-main ov-scratch-records">
            <Panel title="Health" icon="heart" className="ov-scratch-health">
              <Values
                className="ov-scratch-health-values"
                values={[
                  [
                    "Max HP",
                    blankHP ? "" : find(model.resources, "Hit Points"),
                  ],
                  ["Bloodied", model.overview!.bloodied],
                  ["Surges", find(model.resources, "Healing Surges")],
                  ["Surge HP", find(model.resources, "Healing Surge Value")],
                ]}
              />
              <div className="ov-scratch-surges">
                <SurgeBar count={find(model.resources, "Healing Surges")} />
              </div>
              <div className="sp-hp-writing">
                <div>Current HP</div>
                <div>Temporary HP</div>
              </div>
              <div className="ov-health-trackers">
                <div className="sp-death-saves">
                  Death saves
                  <span>
                    {[0, 1, 2].map((n) => (
                      <Icon key={n} name="skull" />
                    ))}
                  </span>
                </div>
                <div className="ov-action-point-count">
                  Action points
                  <span aria-label="Three action point marks">
                    {[0, 1, 2].map((n) => (
                      <Icon key={n} name="circle" />
                    ))}
                  </span>
                </div>
              </div>
            </Panel>
          </div>
          <div className="sp-column">
            <Panel title="Conditions & temporary effects" icon="edit">
              <table className="ov-effects-table">
                <thead>
                  <tr>
                    <th scope="col">Effect</th>
                    <th scope="col">Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
        <div
          className="ov-power-trackers sp-column ov-scratch-powers"
          ref={regionRef}
        >
          {renderTracking(first)}
          {layout.length > 1 ? (
            <p className="sp-caption ov-tracking-caption">
              Power tracking continues on page {startPage + 1}…
            </p>
          ) : null}
        </div>
        <div
          className="ov-scratch-layout ov-scratch-records ov-scratch-bottom"
          ref={recordsRef}
        >
          <Panel title="Treasure & consumables" icon="item">
            <div className="sp-writing-lines ov-scratch-treasure" />
          </Panel>
          <Panel title="Session notes" icon="edit">
            <div className="sp-writing-lines ov-scratch-notes" />
            <div className="sp-xp-tracker">
              <span>XP</span>
              <i />
            </div>
          </Panel>
        </div>
      </Paper>
      {layout.slice(1).map((slice, index) => (
        <Paper
          key={index}
          name={name}
          title="Power usage · continued"
          page={startPage + index + 1}
          source={model.source}
        >
          <div className="sp-page-heading">
            <h2>Power usage</h2>
          </div>
          <div className="ov-power-trackers sp-column">
            {renderTracking(slice)}
          </div>
          {slice.oversized ? (
            <p className="sp-caption">
              A shared-use group exceeds the available page space; its full text
              is retained.
            </p>
          ) : null}
        </Paper>
      ))}
      <div className="ov-measure" aria-hidden="true">
        <Paper
          name={name}
          title="Play scratchpad"
          page=""
          source={model.source}
        >
          <div className="ov-power-trackers sp-column" ref={firstProbe}>
            <TrackingPanels encounter={encounter} daily={daily} />
            <p className="sp-caption ov-tracking-caption">
              Power tracking continues on page {startPage + 1}…
            </p>
          </div>
        </Paper>
        <Paper
          name={name}
          title="Power usage · continued"
          page=""
          source={model.source}
          pageRef={nextPaper}
        >
          <div className="sp-page-heading">
            <h2>Power usage</h2>
          </div>
          <div className="ov-power-trackers sp-column" ref={nextProbe}>
            <TrackingPanels encounter={encounter} daily={daily} />
          </div>
        </Paper>
      </div>
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
  if (o.defensiveTraits?.length)
    result.push({
      id: "defensive-traits",
      name: "Resistances & Weaknesses",
      group: "Resistances & Weaknesses",
      source: "",
      parts: o.defensiveTraits.flatMap((entry) =>
        referenceParts(
          entry.source ? `${entry.value} (${entry.source})` : entry.value,
          entry.label,
        ),
      ),
    });
  // Summary reminders now stay beside page 1; retain only expanded reference-only
  // descriptions here (including discovered core-class power descriptions).
  const summary = o.summaryReminders ?? o.reminders;
  const referenceReminders = o.reminders.filter(
    (entry) =>
      !summary.some(
        (other) => other.label === entry.label && other.value === entry.value,
      ),
  );
  if (referenceReminders.length)
    result.push({
      id: "reminders",
      name: "Reminders",
      group: "Combat reminders",
      source: "",
      parts: referenceReminders.flatMap((entry) =>
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
export function basicAttackReferencePage(
  columns: readonly (readonly ReferenceEntry[])[],
): string | undefined {
  const index = columns.findIndex((column) =>
    column.some((entry) => entry.group === "Basic attack alternatives"),
  );
  return index < 0 ? undefined : `R${Math.floor(index / 2) + 1}`;
}
function Details({
  model,
  name,
  onBasicAttackPage,
}: {
  model: CharacterSheetModel;
  name: string;
  onBasicAttackPage: (page: string | undefined) => void;
}) {
  const entries = useMemo(() => references(model), [model]);
  return (
    <ReferencePages
      model={model}
      name={name}
      entries={entries}
      onBasicAttackPage={onBasicAttackPage}
    />
  );
}

/** Only reminders omitted by the measured summary belong on its continuation. */
export function summaryContinuationEntries(
  values: readonly ReminderEntry[],
  visibleIndices: readonly number[],
): ReferenceEntry[] {
  const visible = new Set(visibleIndices);
  const categories = [
    "Class features",
    "Racial features",
    "Feats",
    "Item properties",
    "Other reminders",
  ];
  return categories.flatMap((category) =>
    values.flatMap((entry, index) =>
      !visible.has(index) && (entry.category ?? "Other reminders") === category
        ? [
            {
              id: `summary-reminder:${index}`,
              name:
                entry.label.replace(/\s*\([^()]*\)/g, "").trim() || entry.label,
              group: category,
              source: "",
              parts:
                entry.elements && entry.elements.length > 1
                  ? referenceParts(
                      entry.elements
                        .map((value) => `• ${value.replace(/\n+/g, " ")}`)
                        .join("\n"),
                    )
                  : referenceParts(entry.value),
            },
          ]
        : [],
    ),
  );
}

function ReferencePages({
  model,
  name,
  entries,
  summaryContinuation = false,
  onPageCount,
  onBasicAttackPage,
}: {
  model: CharacterSheetModel;
  name: string;
  entries: readonly ReferenceEntry[];
  summaryContinuation?: boolean;
  onPageCount?: (count: number) => void;
  onBasicAttackPage?: (page: string | undefined) => void;
}) {
  const title = summaryContinuation
    ? "Character summary · continued"
    : "Character reference";
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
      const next = paginateReferences(entries, measurements, capacity);
      setColumns(next);
      onBasicAttackPage?.(basicAttackReferencePage(next));
      onPageCount?.(Math.ceil(next.length / 2));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [entries, onBasicAttackPage, onPageCount]);
  return (
    <>
      <div className="ov-measure" aria-hidden="true">
        <Paper
          name={name}
          title={title}
          page=""
          source={model.source}
          pageRef={probe}
        >
          <div className="sp-page-heading">
            <h2>{title}</h2>
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
          title={title}
          page={summaryContinuation ? index + 2 : `R${index + 1}`}
          source={model.source}
        >
          <div className="sp-page-heading">
            <h2>{title}</h2>
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
  const [basicAttackPage, setBasicAttackPage] = useState<string>();
  const [summarySelection, setSummarySelection] = useState<{
    model: CharacterSheetModel;
    indices: readonly number[];
  }>();
  const [continuationPages, setContinuationPages] = useState(0);
  const onVisibleReminders = useCallback(
    (indices: readonly number[]) => {
      setSummarySelection({ model, indices });
    },
    [model],
  );
  const continuationEntries = useMemo(
    () =>
      model.overview && summarySelection?.model === model
        ? summaryContinuationEntries(
            model.overview.summaryReminders ?? model.overview.reminders,
            summarySelection.indices,
          )
        : [],
    [model, summarySelection],
  );
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
        basicAttackPage={basicAttackPage}
        onVisibleReminders={onVisibleReminders}
      />
      <ReferencePages
        model={model}
        name={name}
        entries={continuationEntries}
        summaryContinuation
        onPageCount={setContinuationPages}
      />
      <Scratchpad
        model={model}
        name={name}
        blankHP={blankHP}
        startPage={2 + continuationPages}
      />
      <Details
        model={model}
        name={name}
        onBasicAttackPage={setBasicAttackPage}
      />
    </div>
  );
}

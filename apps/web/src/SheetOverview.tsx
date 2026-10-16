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
  isRulesReferencePower,
  referencePowerRows,
} from "./reference-power-index";
import {
  INVENTORY_CATEGORIES,
  LOADOUT_SLOT_COLUMNS,
  ORDERED_LOADOUT_SLOTS,
} from "./equipment-ui";
import { powerActionRank } from "./power-card-order";
import { referenceCurrency } from "./reference-currency";
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
  referenceIdentity,
}: {
  name: string;
  title: string;
  page: number | string;
  source: string;
  children: ReactNode;
  pageRef?: React.RefObject<HTMLElement | null>;
  runningHeader?: ReactNode;
  referenceIdentity?: string;
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
      {page !== 1 && referenceIdentity === undefined ? (
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
      <footer
        className={`sp-page-footer${referenceIdentity !== undefined ? " ov-reference-footer" : ""}`}
      >
        {referenceIdentity !== undefined ? (
          <>
            <span
              className="ov-reference-footer-identity"
              title={[name, referenceIdentity].filter(Boolean).join(" · ")}
            >
              {[name, referenceIdentity].filter(Boolean).join(" · ")}
            </span>
            <span>Character Reference</span>
          </>
        ) : page === 1 ? (
          <span>
            {source === "authoritative-evaluation"
              ? "Character reference"
              : source === "native-empty"
                ? "Incomplete character · no evaluated rules"
                : "Legacy cache · verify missing rules and values"}
          </span>
        ) : null}
        <span className="ov-page-number">{page}</span>
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
}: {
  model: CharacterSheetModel;
  variantLimit?: number;
}) {
  const rows = overviewBasicAttackRows(model, variantLimit);
  const hasMore = rows.length < overviewBasicAttackRows(model).length;
  return (
    <Panel
      title="Basic attacks"
      icon="sword"
      className="sp-basic-attacks"
      headerNote={hasMore ? "More on power cards…" : undefined}
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
  onVisibleReminders,
}: {
  model: CharacterSheetModel;
  name: string;
  portrait: CharacterPortrait | undefined;
  blankHP: boolean;
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
          <BasicAttacks model={model} />
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
  return [...rows].sort(
    (a, b) =>
      powerActionRank(a.action) - powerActionRank(b.action) ||
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
function ScratchpadRecords({
  panelRef,
  height,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  height?: number | undefined;
}) {
  return (
    <div
      className="ov-scratch-layout ov-scratch-records ov-scratch-bottom"
      ref={panelRef}
      style={height === undefined ? undefined : { height }}
    >
      <Panel title="Treasure & consumables" icon="item">
        <div className="sp-writing-lines ov-scratch-treasure" />
      </Panel>
      <Panel title="Session notes" icon="edit">
        <div className="sp-writing-lines ov-scratch-notes" />
        <div className="sp-xp-tracker">
          <span>XP</span>
        </div>
      </Panel>
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
  const recordsProbe = useRef<HTMLDivElement>(null);
  const [recordsHeight, setRecordsHeight] = useState<number>();
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
      const minimumRecordsHeight =
        recordsProbe.current!.getBoundingClientRect().height;
      const footerTop =
        // Stay one pixel inside Paper's 8px guard to absorb fractional layout rounding.
        page.querySelector(".sp-page-footer")!.getBoundingClientRect().top - 9;
      const availableRecordsHeight = Math.max(
        minimumRecordsHeight,
        footerTop - recordsRef.current!.getBoundingClientRect().top,
      );
      setRecordsHeight((old) =>
        old !== undefined && Math.abs(old - availableRecordsHeight) < 0.1
          ? old
          : availableRecordsHeight,
      );
      const layout = paginateTracking(
        measurements(first),
        measurements(next),
        footerTop -
          regionRef.current!.getBoundingClientRect().top -
          minimumRecordsHeight -
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
    observer.observe(recordsProbe.current!);
    observer.observe(regionRef.current!);
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
              {identityLine ? (
                <span className="ov-scratch-header-details">
                  {" "}
                  · {identityLine}
                </span>
              ) : null}
            </span>
            <span>Scratchpad</span>
            <span className="ov-scratch-header-session">
              <strong>Date</strong> <i />
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
                  <span>
                    {[0, 1, 2].map((n) => (
                      <Icon key={n} name="skull" />
                    ))}
                  </span>
                  Death saves
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
        <ScratchpadRecords panelRef={recordsRef} height={recordsHeight} />
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
          <ScratchpadRecords panelRef={recordsProbe} />
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
  paragraph?: number;
  powerIndex?: boolean;
  indexAction?: string;
  tableCategory?: string;
  slotCells?: readonly { label: string; icon: IconName }[];
  rightSlotCells?: readonly { label: string; icon: IconName }[];
  equippedInventory?: boolean;
  inventoryIndex?: number;
}
export interface ReferenceEntry {
  id: string;
  name: string;
  group: string;
  source: string;
  parts: readonly ReferencePart[];
  continued?: boolean;
  level?: number;
  feature?: boolean;
  currency?: readonly SheetValue[];
  inventoryColumns?: readonly (readonly ReferencePart[])[];
}

function inventoryGroups(parts: readonly ReferencePart[]): ReferencePart[][] {
  const groups: ReferencePart[][] = [];
  for (const part of parts) {
    if (
      !groups.length ||
      groups.at(-1)![0]!.tableCategory !== part.tableCategory
    )
      groups.push([]);
    groups.at(-1)!.push(part);
  }
  return groups;
}
function balanceInventoryGroups(
  groups: readonly (readonly ReferencePart[])[],
  cost: (part: ReferencePart) => number,
) {
  // Oversized-category continuations must read down then across in item order.
  if (
    new Set(groups.map((group) => group[0]?.tableCategory)).size < groups.length
  ) {
    const prefix = [0];
    for (const group of groups)
      prefix.push(
        prefix.at(-1)! + group.reduce((sum, part) => sum + cost(part), 0),
      );
    let split = groups.length;
    let height = prefix.at(-1)!;
    for (let at = 1; at < groups.length; at++) {
      const next = Math.max(prefix[at]!, prefix.at(-1)! - prefix[at]!);
      if (next < height) {
        split = at;
        height = next;
      }
    }
    return {
      columns: [groups.slice(0, split).flat(), groups.slice(split).flat()],
      height,
    };
  }
  const columns: ReferencePart[][] = [[], []];
  const heights = [0, 0];
  for (const group of groups) {
    const column = heights[0]! <= heights[1]! ? 0 : 1;
    columns[column]!.push(...group);
    heights[column]! += group.reduce((sum, part) => sum + cost(part), 0);
  }
  return { columns, height: Math.max(...heights) };
}
/** Keep whole categories and their order within each column, balancing printed lines. */
export function balancedInventoryColumns(parts: readonly ReferencePart[]) {
  const groups = inventoryGroups(parts);
  return balanceInventoryGroups(groups, (part) => {
    const name =
      part.block.kind === "table" ? (part.block.rows[0]?.[0] ?? "") : "";
    const heading = groups.some((group) => group[0] === part) ? 2 : 0;
    return heading + Math.max(1, Math.ceil(name.length / 30));
  }).columns;
}
/** Split prose only for layout. Every word, list item and table row remains. */
export function referenceParts(value: string, label?: string): ReferencePart[] {
  const paragraphIds = new Map<ProseBlock, number>();
  const blocks = proseBlocks(value).flatMap<ProseBlock>((block, paragraph) => {
    if (block.kind === "paragraph" && block.text.split(/\s+/).length > 80) {
      const words = block.text.split(/\s+/);
      const chunks = Array.from(
        { length: Math.ceil(words.length / 80) },
        (_, i) => ({
          kind: "paragraph" as const,
          text: words.slice(i * 80, i * 80 + 80).join(" "),
        }),
      );
      chunks.forEach((chunk) => paragraphIds.set(chunk, paragraph));
      return chunks;
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
    if (block.kind === "paragraph") paragraphIds.set(block, paragraph);
    return [block];
  });
  return blocks.map((block, index) => ({
    ...(!index && label ? { label } : {}),
    block,
    ...(paragraphIds.has(block) ? { paragraph: paragraphIds.get(block)! } : {}),
  }));
}
export function references(model: CharacterSheetModel): ReferenceEntry[] {
  const o = model.overview!;
  const order = [
    "Class Feature",
    "Racial Trait",
    "Theme",
    "Background",
    "Paragon Path",
    "Epic Destiny",
    "Feat",
  ];
  const result: ReferenceEntry[] = [...o.features]
    // A Theme entity is an identity/origin overview, like Class or Race—not a
    // feature card. Its granted features retain their own native group and
    // Theme reference provenance, so filtering the root does not hide benefits.
    .filter((feature) => feature.group.trim().toLowerCase() !== "theme")
    .sort((a, b) => {
      const rank = (group: string) =>
        order.includes(group) ? order.indexOf(group) : order.length;
      return (
        rank(a.referenceGroup ?? a.group) - rank(b.referenceGroup ?? b.group) ||
        (a.level ?? Infinity) - (b.level ?? Infinity) ||
        a.name.localeCompare(b.name)
      );
    })
    .flatMap((feature) => {
      const background = feature.group.trim().toLowerCase() === "background";
      const structuredBackground = background && feature.fullTextAvailable;
      const description = structuredBackground ? "" : feature.description;
      const fields = structuredBackground
        ? feature.fields.filter((field) =>
            /^(?:benefits?|associated skills|associated languages|prerequisites?)$/i.test(
              field.label.trim(),
            ),
          )
        : feature.fields;
      // Some legacy definitions put an explicitly labeled Benefit in prose
      // instead of a specific. Retain that authored mechanical tail as fallback.
      const inlineBenefit =
        structuredBackground &&
        !fields.some((field) => /^benefits?$/i.test(field.label.trim()))
          ? /\bBenefit:\s*([\s\S]+)/i.exec(feature.description)?.[1]
          : undefined;
      const parts = [
        ...referenceParts(description),
        ...(inlineBenefit ? referenceParts(inlineBenefit, "Benefit") : []),
        ...fields
          .filter(
            (field) =>
              !(
                /^(?:benefit|flavor(?: text)?|description)$/i.test(
                  field.label,
                ) && description.includes(field.value)
              ),
          )
          .flatMap((field) => referenceParts(field.value, field.label)),
        ...(!feature.fullTextAvailable
          ? referenceParts(
              "Full rules unavailable for this content profile; the retained abbreviated description is shown.",
            )
          : []),
      ];
      if (structuredBackground && !parts.length) return [];
      return [
        {
          id: feature.id,
          name: feature.name,
          group: groupName(
            feature.referenceGroup ??
              (order.includes(feature.group)
                ? feature.group
                : "Other features"),
          ),
          feature: true,
          ...(feature.level === undefined ? {} : { level: feature.level }),
          source: feature.source,
          parts,
        },
      ];
    });
  // References retain authored entities, not synthetic defensive summaries or
  // expanded reminder projections (whose underlying features/powers appear here
  // or on their own cards already).
  for (const equipped of [true, false]) {
    const slotPresentation = (slot: string) =>
      ORDERED_LOADOUT_SLOTS.find(
        (entry) =>
          entry.id === slot.trim().toLowerCase().replaceAll(" ", "-") ||
          entry.label.toLowerCase() === slot.trim().toLowerCase(),
      );
    const slotRank = (slots: readonly string[]) =>
      Math.min(
        ...slots.map((slot) => {
          const presentation = slotPresentation(slot);
          return presentation
            ? ORDERED_LOADOUT_SLOTS.indexOf(presentation)
            : Infinity;
        }),
      );
    const entries = o.inventory
      .map((item) => ({
        ...item,
        referenceSlot:
          [...item.slots]
            .sort((a, b) => slotRank([a]) - slotRank([b]))
            .map(
              (slot) =>
                slotPresentation(slot)?.label ?? slot.replaceAll("-", " "),
            )
            .join(" / ") ||
          (find(item.fields, "Item Slot") === "—"
            ? "Held / unspecified"
            : find(item.fields, "Item Slot")),
        slotRank: slotRank(
          item.slots.length ? item.slots : [find(item.fields, "Item Slot")],
        ),
        inventoryCategory:
          INVENTORY_CATEGORIES.find(
            (category) => category.id === item.category,
          ) ?? INVENTORY_CATEGORIES.at(-1)!,
        quantity: equipped
          ? Math.min(item.quantity, item.equipped)
          : item.quantity,
      }))
      .filter((item) => item.quantity > 0)
      .sort(
        (a, b) =>
          (equipped
            ? a.slotRank - b.slotRank
            : INVENTORY_CATEGORIES.indexOf(a.inventoryCategory) -
              INVENTORY_CATEGORIES.indexOf(b.inventoryCategory)) ||
          a.name.localeCompare(b.name),
      );
    if (equipped || entries.length)
      result.push({
        id: `inventory:${equipped}`,
        name: equipped ? "Equipped" : "Inventory",
        group: "Items",
        source: "",
        ...(equipped
          ? {
              currency: model.currency ?? [
                { label: "Carried", value: find(model.notes, "CarriedMoney") },
                { label: "Stored", value: find(model.notes, "StoredMoney") },
              ],
            }
          : {}),
        parts: entries.map((item) => ({
          ...(!equipped ? { tableCategory: item.inventoryCategory.label } : {}),
          ...(!equipped && item.equipped > 0
            ? { equippedInventory: true }
            : {}),
          ...(equipped
            ? {
                slotCells: (item.slots.length
                  ? [...item.slots].sort(
                      (a, b) => slotRank([a]) - slotRank([b]),
                    )
                  : [item.referenceSlot]
                ).map((slot) => ({
                  label:
                    slotPresentation(slot)?.label ?? slot.replaceAll("-", " "),
                  icon: slotPresentation(slot)?.icon ?? ("item" as IconName),
                })),
              }
            : {}),
          block: {
            kind: "table" as const,
            headers: equipped ? ["Slot", "Item"] : ["Item", "Qty"],
            rows: [
              [
                ...(equipped ? [item.referenceSlot] : []),
                item.name,
                ...(!equipped ? [String(item.quantity)] : []),
              ],
            ],
          },
        })),
      });
  }
  const equipped = result.find((entry) => entry.id === "inventory:true")!;
  // Ordinary open slots remain useful lookup rows. Conditional implement and
  // companion slots appear only when represented in the actual loadout.
  const occupiedParts = equipped.parts;
  const ordinarySlots = LOADOUT_SLOT_COLUMNS.flatMap(
    (column) => column.slots,
  ).filter((slot) => !slot.requiredActiveDefinitionId);
  const allSlots = [
    ...ordinarySlots,
    ...ORDERED_LOADOUT_SLOTS.filter(
      (slot) =>
        !ordinarySlots.includes(slot) &&
        occupiedParts.some((part) =>
          part.slotCells?.some((cell) => cell.label === slot.label),
        ),
    ),
  ];
  equipped.parts = [
    ...allSlots
      .sort(
        (a, b) =>
          ORDERED_LOADOUT_SLOTS.indexOf(a) - ORDERED_LOADOUT_SLOTS.indexOf(b),
      )
      .map((slot) => ({
        slotCells: [{ label: slot.label, icon: slot.icon }],
        block: {
          kind: "table" as const,
          headers: ["Slot", "Item"],
          rows: [
            [
              slot.label,
              occupiedParts
                .flatMap((part) =>
                  part.slotCells?.some((cell) => cell.label === slot.label) &&
                  part.block.kind === "table"
                    ? part.block.rows.map((row) => row[1]!)
                    : [],
                )
                .join(", ") || "—",
            ],
          ],
        },
      })),
    ...occupiedParts.filter(
      (part) =>
        !part.slotCells?.some((cell) =>
          allSlots.some((slot) => slot.label === cell.label),
        ),
    ),
  ];
  const slots = equipped.parts;
  const breakAt =
    slots.findIndex((part) => part.slotCells?.[0]?.label === "Feet") + 1;
  const leftSlots = slots.slice(0, breakAt);
  const rightSlots = slots.slice(breakAt);
  equipped.parts = Array.from(
    { length: Math.max(leftSlots.length, rightSlots.length) },
    (_, i) => {
      const left = leftSlots[i];
      const right = rightSlots[i];
      const cells = (part: ReferencePart | undefined) =>
        part?.block.kind === "table" ? part.block.rows[0]! : ["", ""];
      return {
        ...(left?.slotCells ? { slotCells: left.slotCells } : {}),
        ...(right?.slotCells ? { rightSlotCells: right.slotCells } : {}),
        block: {
          kind: "table",
          headers: ["Slot", "Item", "Slot", "Item"],
          rows: [[...cells(left), ...cells(right)]],
        },
      };
    },
  );
  for (const usage of ["At-Will", "Encounter", "Daily", "Other"]) {
    const available = model.powers.filter(
      (power) => !isRulesReferencePower(power),
    );
    const matching = available.filter((power) =>
      usage === "Other"
        ? !/^(?:at-will|encounter|daily)/i.test(power.usage ?? "")
        : (power.usage ?? "").toLowerCase().startsWith(usage.toLowerCase()),
    );
    const parts: ReferencePart[] = [];
    for (const common of usage === "At-Will" ? [false, true] : [false]) {
      const powers =
        usage === "At-Will"
          ? matching.filter((power) => Boolean(power.universal) === common)
          : matching;
      parts.push(
        ...sortedTrackingRows(
          powers.map((power) => ({
            id: power.id ?? power.name,
            name: power.name,
            action: power.actionType ?? "",
            usage: power.usage ?? "",
            utility:
              find(power.fields, "Power Type").toLowerCase() === "utility",
          })),
        ).flatMap((row) => {
          const power = powers.find(
            (entry) => (entry.id ?? entry.name) === row.id,
          )!;
          return [
            {
              powerIndex: true,
              indexAction: power.actionType ?? "",
              ...(common ? { tableCategory: "Universal actions" } : {}),
              block: {
                kind: "table" as const,
                headers: [
                  "Power",
                  "Level",
                  "Range",
                  "Target",
                  "Attack",
                  "Damage",
                ],
                rows: referencePowerRows(power),
              },
            },
          ];
        }),
      );
    }
    if (parts.length)
      result.push({
        id: `powers:${usage}`,
        name: `${usage} powers`,
        group: "Power index",
        source: "",
        parts,
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
        powerIndex: true,
        indexAction: power.action,
        block: {
          kind: "table" as const,
          headers: ["Item", "Usage"],
          rows: [[power.name, power.usage || "Usage unspecified"]],
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
  for (const note of model.notes.filter(
    (note) => !/^(?:Carried|Stored)Money$/i.test(note.label),
  ))
    result.push({
      id: `note:${note.label}`,
      name: note.label.replace(/([a-z])([A-Z])/g, "$1 $2"),
      group: "Character record",
      source: "",
      parts: referenceParts(note.value),
    });
  return result;
}
const referenceCategory = (group: string) =>
  group.toLowerCase().replace(/[^a-z]+/g, "-");
const referenceIcon = (group: string): IconName =>
  group === "Feats"
    ? "feat"
    : group.startsWith("Racial")
      ? "race"
      : group === "Class features"
        ? "class"
        : group === "Items"
          ? "item"
          : group === "Background"
            ? "background"
            : "book";
function EquippedTables({ parts }: { parts: readonly ReferencePart[] }) {
  return (
    <div className="ov-equipped-columns">
      {[0, 2].map((column) => (
        <table className="ov-reference-table ov-equipped-table" key={column}>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Item</th>
            </tr>
          </thead>
          {parts.map((part, i) => {
            const row =
              part.block.kind === "table" ? part.block.rows[0] : undefined;
            const slots = column === 0 ? part.slotCells : part.rightSlotCells;
            if (!row?.[column]) return null;
            return (
              <tbody
                className="ov-reference-part"
                data-equipment-index={i}
                key={i}
              >
                <tr>
                  <td>
                    <span className="ov-slot-cell">
                      {slots?.map((slot, n) => (
                        <span key={n}>
                          {n ? " / " : null}
                          <Icon name={slot.icon} />
                          {slot.label}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>{row[column + 1]}</td>
                </tr>
              </tbody>
            );
          })}
        </table>
      ))}
    </div>
  );
}
function ReferenceCard({
  entry,
  measure = false,
  nested = false,
  inventoryColumn = false,
}: {
  entry: ReferenceEntry;
  measure?: boolean;
  nested?: boolean;
  inventoryColumn?: boolean;
}) {
  if (entry.currency) {
    const { currency, ...loadout } = entry;
    const wallet = referenceCurrency(currency);
    return (
      <div
        className="ov-reference-card ov-equipment-stack"
        data-reference-id={entry.id}
      >
        <section
          className="sp-feature-card ov-reference-pane ov-currency-pane"
          data-reference-category="items"
        >
          <header>
            <Icon name="circle-dollar-sign" />
            <h3>Currency</h3>
          </header>
          <div className="sp-feature-body">
            <div className="ov-wallet-groups">
              {wallet.headers.slice(1).map((label, column) => (
                <section
                  className={`ov-stat-group ov-wallet-group${label === "Stored" && wallet.storedEmpty ? " is-empty" : ""}`}
                  aria-label={`${label} currency`}
                  key={label}
                >
                  <h4>{label}</h4>
                  <div className="sp-values ov-band-values ov-wallet-values">
                    {wallet.rows.map((row) => (
                      <div key={row[0]}>
                        <span>{row[0]}</span>
                        <strong>{row[column + 1]}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {wallet.notes.map((note, i) => (
              <div className="ov-currency-note" key={i}>
                {note.label ? <strong>{note.label}: </strong> : null}
                <Prose value={note.value} />
              </div>
            ))}
          </div>
        </section>
        <ReferenceCard entry={loadout} measure={measure} nested />
      </div>
    );
  }
  if (entry.id.startsWith("inventory:false") && !inventoryColumn) {
    const columns =
      entry.inventoryColumns ?? balancedInventoryColumns(entry.parts);
    return (
      <section
        className="sp-feature-card ov-reference-card ov-reference-pane"
        data-reference-id={entry.id}
        data-reference-category="items"
      >
        <header>
          <Icon name="item" />
          <h3>Inventory{entry.continued ? " (continued)" : ""}</h3>
          {entry.parts.some((part) => part.equippedInventory) ? (
            <span className="ov-inventory-legend">
              <sup>E</sup> Equipped
            </span>
          ) : null}
        </header>
        <div className="sp-feature-body ov-inventory-columns">
          {columns.map((parts, i) =>
            parts.length ? (
              <ReferenceCard
                key={i}
                entry={{
                  ...entry,
                  parts: parts.map((part) => ({
                    ...part,
                    inventoryIndex: entry.parts.indexOf(part),
                  })),
                }}
                measure={measure}
                nested
                inventoryColumn
              />
            ) : (
              <div key={i} />
            ),
          )}
        </div>
      </section>
    );
  }
  const parts: ReferencePart[] = [];
  for (const part of entry.parts) {
    const last = parts.at(-1);
    if (
      !measure &&
      last?.block.kind === "paragraph" &&
      part.block.kind === "paragraph" &&
      part.paragraph !== undefined &&
      last.paragraph === part.paragraph &&
      !part.label
    )
      parts[parts.length - 1] = {
        ...last,
        block: {
          kind: "paragraph",
          text: `${last.block.text} ${part.block.text}`,
        },
      };
    else parts.push(part);
  }
  const tables =
    parts.length > 0 &&
    parts.every(
      (part) =>
        part.block.kind === "table" &&
        !part.label &&
        JSON.stringify(part.block.headers) ===
          JSON.stringify(
            (parts[0]!.block as Extract<ProseBlock, { kind: "table" }>).headers,
          ),
    );
  const headers = tables
    ? ((parts[0]!.block as Extract<ProseBlock, { kind: "table" }>).headers ??
      [])
    : [];
  let categoryStart = 0;
  const striped = parts.map((part, index) => {
    if (index === 0 || part.tableCategory !== parts[index - 1]?.tableCategory)
      categoryStart = index;
    return (index - categoryStart) % 2 === 0;
  });
  return (
    <section
      className={
        inventoryColumn
          ? "ov-inventory-column"
          : `sp-feature-card ov-reference-pane${nested ? "" : " ov-reference-card"}`
      }
      data-reference-id={entry.id}
      data-reference-category={referenceCategory(entry.group)}
      data-usage={/^powers:(At-Will|Encounter|Daily)/.exec(entry.id)?.[1]}
    >
      {!inventoryColumn ? (
        <header>
          <Icon name={referenceIcon(entry.group)} />
          <h3>
            {entry.name}
            {entry.continued ? " (continued)" : ""}
          </h3>
          {entry.feature ? (
            <span className="ov-reference-level">
              {entry.level === undefined ? "Level —" : `Level ${entry.level}`}
            </span>
          ) : null}
          {entry.id.startsWith("inventory:false") &&
          parts.some((part) => part.equippedInventory) ? (
            <span className="ov-inventory-legend">
              <sup>E</sup> Equipped
            </span>
          ) : null}
        </header>
      ) : null}
      <div className="sp-feature-body">
        {tables && entry.id.startsWith("inventory:true") ? (
          <EquippedTables parts={parts} />
        ) : tables ? (
          <table
            className={`ov-reference-table${parts[0]?.powerIndex && headers.length === 6 ? " ov-power-index-table" : ""}${entry.id.startsWith("inventory:true") ? " ov-equipped-table" : entry.id.startsWith("inventory:false") ? " ov-inventory-table" : ""}`}
          >
            {!inventoryColumn ? (
              <thead>
                <tr>
                  {headers.map((heading) => (
                    <th scope="col" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            {parts.map((part, index) => (
              <tbody
                className={`ov-reference-part${inventoryColumn && striped[index] ? " is-striped" : ""}`}
                data-inventory-index={part.inventoryIndex}
                key={index}
              >
                {part.tableCategory &&
                (index === 0 ||
                  part.tableCategory !== parts[index - 1]?.tableCategory) ? (
                  <tr
                    className={`ov-reference-table-category${part.powerIndex ? " ov-power-index-subheading" : " ov-reference-inventory-category"}`}
                  >
                    <th colSpan={headers.length} scope="rowgroup">
                      {part.tableCategory}
                    </th>
                  </tr>
                ) : null}
                {(
                  part.block as Extract<ProseBlock, { kind: "table" }>
                ).rows.map((row, n) =>
                  inventoryColumn ? (
                    <tr key={n}>
                      <td
                        className="ov-inventory-quantity"
                        aria-label={`Quantity ${row[1]}`}
                      >
                        <span>{row[1] === "1" ? "\u00a0" : `${row[1]}×`}</span>
                      </td>
                      <td>
                        {row[0]}
                        {part.equippedInventory ? (
                          <sup
                            className="ov-equipped-marker"
                            aria-label="Equipped"
                          >
                            E
                          </sup>
                        ) : null}
                      </td>
                    </tr>
                  ) : (
                    <tr key={n}>
                      {row.map((cell, column) => (
                        <td key={column}>
                          {(part.slotCells && column === 0) ||
                          (part.rightSlotCells && column === 2) ? (
                            <span className="ov-slot-cell">
                              {(column === 0
                                ? part.slotCells!
                                : part.rightSlotCells!
                              ).map((slot, i) => (
                                <span key={i}>
                                  {i ? " / " : null}
                                  <Icon name={slot.icon} />
                                  {slot.label}
                                </span>
                              ))}
                            </span>
                          ) : part.powerIndex && column === 0 && n === 0 ? (
                            <>
                              {part.indexAction ? (
                                <>
                                  <ActionTypeIcon
                                    decorative
                                    value={part.indexAction}
                                  />
                                  <span className="sp-sr-only">
                                    {part.indexAction}:{" "}
                                  </span>
                                </>
                              ) : null}
                              {cell}
                            </>
                          ) : (
                            cell
                          )}
                          {part.equippedInventory && column === 0 ? (
                            <sup
                              className="ov-equipped-marker"
                              aria-label="Equipped"
                            >
                              E
                            </sup>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            ))}
          </table>
        ) : (
          parts.map((part, index) => (
            <div
              className={`ov-reference-part${/^(?:flavor|prerequisites?)$/i.test(part.label ?? "") ? " is-secondary" : ""}`}
              key={index}
            >
              {part.label ? <strong>{part.label}: </strong> : null}
              <ProseBlocks blocks={[part.block]} />
            </div>
          ))
        )}
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
  groupHeadingHeight = 0,
): readonly (readonly ReferenceEntry[])[] {
  if (!entries.length) return [];
  const columns: ReferenceEntry[][] = [[]];
  const seenGroups = new Set<string>();
  let used = 0;
  const place = (entry: ReferenceEntry, height: number) => {
    const heading = seenGroups.has(entry.group) ? 0 : groupHeadingHeight;
    if (used && used + height + 16 + heading > capacity) {
      columns.push([]);
      used = 0;
    }
    columns.at(-1)!.push(entry);
    seenGroups.add(entry.group);
    used += height + 16 + heading;
  };
  for (const [index, entry] of entries.entries()) {
    const m = measurements.get(entry.id);
    // Avoid a category heading stranded near the foot of a column with only
    // one card beneath it. Reserve two complete cards when that opening can
    // fit in a fresh column; large cards retain their normal splitting flow.
    const next = entries[index + 1];
    const nextMeasurement =
      next?.group === entry.group ? measurements.get(next.id) : undefined;
    if (
      used &&
      groupHeadingHeight &&
      !seenGroups.has(entry.group) &&
      m &&
      nextMeasurement
    ) {
      const openingHeight =
        groupHeadingHeight + m.height + nextMeasurement.height + 32;
      if (openingHeight <= capacity && used + openingHeight > capacity) {
        columns.push([]);
        used = 0;
      }
    }
    if (!m) {
      // Preserve unmeasured content; the page overflow indicator remains explicit.
      place(entry, capacity);
      continue;
    }
    const inventoryHeading = seenGroups.has(entry.group)
      ? 0
      : groupHeadingHeight;
    if (
      entry.id.startsWith("inventory:false") &&
      m.height + inventoryHeading > capacity
    ) {
      const bodyCapacity = Math.max(
        1,
        capacity - m.overhead - inventoryHeading,
      );
      const costs = new Map(
        entry.parts.map((part, i) => [part, m.parts[i] ?? bodyCapacity]),
      );
      const cost = (part: ReferencePart) => costs.get(part) ?? bodyCapacity;
      const groups: ReferencePart[][] = [];
      for (const category of inventoryGroups(entry.parts)) {
        if (
          category.reduce((sum, part) => sum + cost(part), 0) <= bodyCapacity
        ) {
          groups.push(category);
          continue;
        }
        // Only a category taller than a fresh column may be divided. Reserve
        // its repeated category heading when beginning a continuation chunk.
        let chunk: ReferencePart[] = [];
        let height = 0;
        for (const part of category) {
          if (chunk.length && height + cost(part) > bodyCapacity) {
            groups.push(chunk);
            chunk = [];
            height = 0;
            costs.set(part, cost(part) + 30);
          }
          chunk.push(part);
          height += cost(part);
        }
        if (chunk.length) groups.push(chunk);
      }
      let offset = 0;
      while (offset < groups.length) {
        let count = 1;
        while (
          offset + count < groups.length &&
          balanceInventoryGroups(groups.slice(offset, offset + count + 1), cost)
            .height <= bodyCapacity
        )
          count++;
        const balanced = balanceInventoryGroups(
          groups.slice(offset, offset + count),
          cost,
        );
        place(
          {
            ...entry,
            id: `${entry.id}:part${offset + 1}`,
            continued: offset > 0,
            parts: groups.slice(offset, offset + count).flat(),
            inventoryColumns: balanced.columns,
          },
          m.overhead + balanced.height,
        );
        offset += count;
      }
      continue;
    }
    if (
      m.height + (seenGroups.has(entry.group) ? 0 : groupHeadingHeight) <=
      capacity
    ) {
      place(entry, m.height);
      continue;
    }
    let parts: ReferencePart[] = [],
      height = m.overhead + 25,
      partIndex = 0;
    for (const part of entry.parts) {
      const h = m.parts[partIndex++] ?? 0;
      if (
        parts.length &&
        height + h + (seenGroups.has(entry.group) ? 0 : groupHeadingHeight) >
          capacity
      ) {
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
export interface ReferenceCategoryBlock {
  group: string;
  opening: boolean;
  columns: readonly (readonly ReferenceEntry[])[];
}
/** Stack category-local two-column blocks, preserving down-then-across order. */
export function paginateReferenceGroups(
  entries: readonly ReferenceEntry[],
  measurements: ReadonlyMap<
    string,
    { height: number; overhead: number; parts: readonly number[] }
  >,
  capacity: number,
  headingHeight: number,
): readonly (readonly ReferenceCategoryBlock[])[] {
  if (!entries.length) return [];
  const pages: ReferenceCategoryBlock[][] = [[]];
  let used = 0;
  const gap = 16;
  const groups = [...new Set(entries.map((entry) => entry.group))];
  for (const group of groups) {
    const heights = new Map<ReferenceEntry, number>();
    const cards = entries
      .filter((entry) => entry.group === group)
      .flatMap((entry) => {
        const m = measurements.get(entry.id);
        const fragments = entry.parts.length
          ? paginateReferences(
              [entry],
              measurements,
              capacity - headingHeight - gap,
            ).flat()
          : [entry];
        for (const fragment of fragments) {
          heights.set(
            fragment,
            fragment === entry
              ? (m?.height ?? capacity)
              : (m?.overhead ?? 0) +
                  25 +
                  fragment.parts.reduce(
                    (sum, part) =>
                      sum + (m?.parts[entry.parts.indexOf(part)] ?? 0),
                    0,
                  ),
          );
        }
        return fragments;
      });
    let offset = 0;
    let opening = true;
    while (offset < cards.length) {
      const heading = opening ? headingHeight : 0;
      const available = capacity - used - heading;
      // Find the most even contiguous split for each candidate prefix.
      const balance = (count: number) => {
        const prefix = [0];
        for (const card of cards.slice(offset, offset + count))
          prefix.push(prefix.at(-1)! + (heights.get(card) ?? capacity) + gap);
        let split = count;
        let height = prefix[count]!;
        for (let at = 1; at < count; at++) {
          const candidate = Math.max(prefix[at]!, prefix[count]! - prefix[at]!);
          if (candidate <= height) {
            split = at;
            height = candidate;
          }
        }
        return { split, height };
      };
      // Keep an entire category together when a fresh page can hold it. For
      // larger categories, still keep the opening with at least two cards.
      const wholeHeight = balance(cards.length - offset).height;
      const keepHeight =
        wholeHeight + heading <= capacity
          ? wholeHeight
          : balance(Math.min(2, cards.length - offset)).height;
      if (
        used &&
        opening &&
        keepHeight > available &&
        keepHeight + heading <= capacity
      ) {
        pages.push([]);
        used = 0;
        continue;
      }
      let count = 0;
      while (
        offset + count < cards.length &&
        balance(count + 1).height <= available
      )
        count++;
      if (!count && used) {
        pages.push([]);
        used = 0;
        continue;
      }
      // Preserve an unmeasurable/unsplittable card and expose existing overflow warning.
      count = Math.max(1, count);
      const { split, height } = balance(count);
      const selected = cards.slice(offset, offset + count);
      pages.at(-1)!.push({
        group,
        opening,
        columns: [selected.slice(0, split), selected.slice(split)],
      });
      used += heading + height;
      opening = false;
      offset += count;
      if (offset < cards.length) {
        pages.push([]);
        used = 0;
      }
    }
  }
  return pages;
}
function Details({
  model,
  name,
}: {
  model: CharacterSheetModel;
  name: string;
}) {
  const sections = useMemo(() => {
    const entries = references(model);
    const bucket = (entry: ReferenceEntry) =>
      entry.group === "Items"
        ? 1
        : /^(?:Power index|Item power index)$/.test(entry.group)
          ? 2
          : entry.group === "Rituals & practices"
            ? 3
            : entry.group === "Character record"
              ? 4
              : 0;
    const groups = [
      "Class features",
      "Racial traits",
      "Racial features",
      "Theme",
      "Background",
      "Paragon paths",
      "Epic destinies",
      "Feats",
      "Other features",
    ];
    return Array.from({ length: 5 }, (_, index) =>
      entries
        .filter((entry) => bucket(entry) === index)
        .sort((a, b) =>
          index
            ? 0
            : (groups.includes(a.group)
                ? groups.indexOf(a.group)
                : groups.length) -
                (groups.includes(b.group)
                  ? groups.indexOf(b.group)
                  : groups.length) ||
              (a.level ?? Infinity) - (b.level ?? Infinity) ||
              a.name.localeCompare(b.name),
        ),
    );
  }, [model]);
  const [counts, setCounts] = useState<readonly number[]>([0, 0, 0, 0, 0]);
  const callbacks = useMemo(
    () =>
      Array.from(
        { length: 5 },
        (_, index) => (count: number) =>
          setCounts((old) =>
            old[index] === count
              ? old
              : old.map((value, n) => (n === index ? count : value)),
          ),
      ),
    [],
  );
  return (
    <>
      {sections.map((entries, index) => (
        <ReferencePages
          key={index}
          model={model}
          name={name}
          entries={entries}
          wide={index === 1 || index === 2}
          startPage={1 + counts.slice(0, index).reduce((a, b) => a + b, 0)}
          onPageCount={callbacks[index]!}
        />
      ))}
    </>
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
  wide = false,
  startPage = 1,
}: {
  model: CharacterSheetModel;
  name: string;
  entries: readonly ReferenceEntry[];
  summaryContinuation?: boolean;
  onPageCount?: (count: number) => void;
  wide?: boolean;
  startPage?: number;
}) {
  const referenceFooter = summaryContinuation
    ? {}
    : {
        referenceIdentity: ["Race", "Class", "Level"]
          .map((label) => find(model.identity, label))
          .filter((value) => value !== "—" && value.trim())
          .join(" "),
      };
  const title = summaryContinuation
    ? "Character summary · continued"
    : "Character reference";
  const probe = useRef<HTMLElement>(null);
  const [columns, setColumns] = useState<
    readonly (readonly ReferenceEntry[])[]
  >([]);
  const grouped = !wide && !summaryContinuation;
  const [categoryPages, setCategoryPages] = useState<
    readonly (readonly ReferenceCategoryBlock[])[]
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
          const measuredParts = Array.from(
            card.querySelectorAll<HTMLElement>(".ov-reference-part"),
          );
          if (card.querySelector(".ov-inventory-columns"))
            measuredParts.sort(
              (a, b) =>
                Number(a.dataset.inventoryIndex) -
                Number(b.dataset.inventoryIndex),
            );
          let heights = measuredParts.map(
            (part) => part.getBoundingClientRect().height,
          );
          if (card.querySelector(".ov-equipped-columns")) {
            const paired = new Map<number, number>();
            measuredParts.forEach((part) => {
              const index = Number(part.dataset.equipmentIndex);
              paired.set(
                index,
                Math.max(
                  paired.get(index) ?? 0,
                  part.getBoundingClientRect().height,
                ),
              );
            });
            heights = [...paired]
              .sort(([a], [b]) => a - b)
              .map(([, height]) => height);
          }
          return [
            card.dataset.referenceId!,
            {
              height: card.getBoundingClientRect().height,
              overhead:
                card.getBoundingClientRect().height -
                (card.querySelector(
                  ".ov-inventory-columns, .ov-equipped-columns",
                )
                  ? Math.max(
                      0,
                      ...Array.from(
                        card.querySelectorAll(
                          ".ov-inventory-column, .ov-equipped-table",
                        ),
                      ).map((column) =>
                        Array.from(
                          column.querySelectorAll(".ov-reference-part"),
                        ).reduce(
                          (sum, part) =>
                            sum + part.getBoundingClientRect().height,
                          0,
                        ),
                      ),
                    )
                  : heights.reduce((sum, h) => sum + h, 0)),
              parts: heights,
            },
          ] as const;
        }),
      );
      const heading = element.querySelector<HTMLElement>(
        ".ov-reference-group-heading",
      );
      const headingHeight = heading
        ? heading.getBoundingClientRect().height +
          parseFloat(getComputedStyle(heading).marginBottom)
        : 0;
      if (grouped) {
        const pages = paginateReferenceGroups(
          entries,
          measurements,
          capacity,
          headingHeight,
        );
        setCategoryPages(pages);
        onPageCount?.(pages.length);
        return;
      }
      const next = paginateReferences(
        entries,
        measurements,
        capacity,
        summaryContinuation ? 0 : headingHeight,
      );
      setColumns(next);
      onPageCount?.(Math.ceil(next.length / (wide ? 1 : 2)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [entries, onPageCount, wide, startPage, summaryContinuation, grouped]);
  const seenGroups = new Set<string>();
  const categoryOpenings = new Set(
    columns
      .flat()
      .filter((entry) => {
        if (seenGroups.has(entry.group)) return false;
        seenGroups.add(entry.group);
        return true;
      })
      .map((entry) => entry.id),
  );
  return (
    <>
      <div className="ov-measure" aria-hidden="true">
        <Paper
          name={name}
          title={title}
          page=""
          source={model.source}
          pageRef={probe}
          {...referenceFooter}
        >
          {summaryContinuation ? (
            <div className="sp-page-heading">
              <h2>{title}</h2>
            </div>
          ) : null}
          <div className={`ov-measure-column${wide ? " is-wide" : ""}`}>
            {!summaryContinuation ? (
              <h3 className="ov-reference-group-heading ov-reference-group-probe">
                Class features
              </h3>
            ) : null}
            {entries.map((entry) => (
              <ReferenceCard entry={entry} key={entry.id} measure />
            ))}
          </div>
        </Paper>
      </div>
      {grouped
        ? categoryPages.map((blocks, index) => (
            <Paper
              key={index}
              name={name}
              title={title}
              page={`R${startPage + index}`}
              source={model.source}
              {...referenceFooter}
            >
              <div className="ov-reference-category-stack">
                {blocks.map((block) => (
                  <section
                    className="ov-reference-category-block"
                    key={block.group}
                    data-reference-group={block.group}
                  >
                    {block.opening ? (
                      <h3
                        className="ov-reference-group-heading"
                        data-reference-category={referenceCategory(block.group)}
                      >
                        <Icon name={referenceIcon(block.group)} />
                        {block.group}
                      </h3>
                    ) : null}
                    <div className="sp-feature-columns ov-reference-columns">
                      {block.columns.map((column, n) => (
                        <div className="sp-column" key={n}>
                          {column.map((entry) => (
                            <ReferenceCard key={entry.id} entry={entry} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </Paper>
          ))
        : null}
      {Array.from(
        { length: grouped ? 0 : Math.ceil(columns.length / (wide ? 1 : 2)) },
        (_, index) => (
          <Paper
            key={index}
            name={name}
            title={title}
            page={summaryContinuation ? index + 2 : `R${startPage + index}`}
            source={model.source}
            {...referenceFooter}
          >
            {summaryContinuation ? (
              <div className="sp-page-heading">
                <h2>{title}</h2>
              </div>
            ) : null}
            <div
              className={`sp-feature-columns ov-reference-columns${wide ? " is-wide" : ""}`}
            >
              {columns
                .slice(index * (wide ? 1 : 2), (index + 1) * (wide ? 1 : 2))
                .map((column, n) => (
                  <div className="sp-column" key={n}>
                    {column.map((entry) => (
                      <div key={entry.id}>
                        {!summaryContinuation &&
                        categoryOpenings.has(entry.id) ? (
                          <h3
                            className="ov-reference-group-heading"
                            data-reference-category={referenceCategory(
                              entry.group,
                            )}
                          >
                            <Icon name={referenceIcon(entry.group)} />
                            {entry.group}
                          </h3>
                        ) : null}
                        <ReferenceCard entry={entry} />
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </Paper>
        ),
      )}
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
  children,
}: {
  model: CharacterSheetModel;
  name: string;
  portrait: CharacterPortrait | undefined;
  paper: "letter" | "a4";
  monochrome: boolean;
  blankHP: boolean;
  children?: ReactNode;
}) {
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
  if (!model.overview) return <>{children}</>;
  const overviewClass = `sheet-overview sp-prototype sp-paper-${paper}${monochrome ? " sp-monochrome" : ""} print-only`;
  return (
    <>
      <div className={overviewClass}>
        <Summary
          model={model}
          name={name}
          portrait={portrait}
          blankHP={blankHP}
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
      </div>
      {children}
      <div className={overviewClass}>
        <Details model={model} name={name} />
      </div>
    </>
  );
}

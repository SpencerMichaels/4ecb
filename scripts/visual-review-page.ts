/**
 * The visual-review page (scripts/build-visual-review.ts): parses
 * docs/visual-review-checklist.md and renders one self-contained HTML page,
 * grouped by review character, with links into the running app and a
 * checkbox per checklist item per page (kept in localStorage).
 */
import type { ContentPackManifest } from "@4ecb/content-pack";

import type { BuiltCharacter } from "./build-visual-review";
import type { ReviewLink, ReviewPlan } from "./visual-review-plan";

export interface ChecklistItem {
  readonly section: string;
  readonly title: string;
  /** The item's markdown, continuation lines included, without "- [ ] ". */
  readonly body: string;
  readonly checked: boolean;
}

/** Top-level "- [ ]" items, each with its indented continuation. */
export function parseChecklist(markdown: string): ChecklistItem[] {
  const items: { section: string; lines: string[]; checked: boolean }[] = [];
  let section = "";
  let current: (typeof items)[number] | undefined;
  for (const line of markdown.split("\n")) {
    const heading = /^#{2,}\s+(.*)$/.exec(line);
    if (heading !== null) {
      section = heading[1]!.trim();
      current = undefined;
      continue;
    }
    const item = /^- \[( |x|X)\] (.*)$/.exec(line);
    if (item !== null) {
      current = { section, lines: [item[2]!], checked: item[1] !== " " };
      items.push(current);
      continue;
    }
    if (current === undefined) continue;
    if (line.trim() === "" || /^\s/.test(line)) current.lines.push(line);
    else current = undefined;
  }
  return items.map(({ section: itemSection, lines, checked }) => {
    const body = lines.join("\n").trimEnd();
    const bold = /\*\*(.+?)\*\*/.exec(body);
    const title = (bold?.[1] ?? body.split("\n")[0]!)
      .trim()
      .replace(/[.:]$/, "");
    return { section: itemSection, title, body, checked };
  });
}

export function normalizeTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchItem(
  items: readonly ChecklistItem[],
  name: string,
): ChecklistItem | undefined {
  const wanted = normalizeTitle(name);
  return items.find((item) => normalizeTitle(item.title).startsWith(wanted));
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function inline(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** A checklist item's body as HTML: its first paragraph and sub-bullets. */
function itemBodyHtml(body: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (paragraph.length > 0)
      blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
    if (bullets.length > 0)
      blocks.push(
        `<ul>${bullets.map((bullet) => `<li>${inline(bullet)}</li>`).join("")}</ul>`,
      );
    bullets = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("- ")) {
      if (paragraph.length > 0) {
        blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
        paragraph = [];
      }
      bullets.push(line.slice(2));
    } else if (bullets.length > 0) bullets[bullets.length - 1] += ` ${line}`;
    else paragraph.push(line);
  }
  flush();
  return blocks.join("");
}

function hashFor(characterId: string, path: string): string {
  const id = encodeURIComponent(characterId);
  if (path === "sheet") return `#/characters/${id}`;
  if (path === "preview") return `#/characters/${id}?preview=1`;
  return `#/characters/${id}/edit?${path}`;
}

/** Plain text with `#/…` hashes turned into app links. */
function stepsHtml(text: string): string {
  return inline(text).replace(
    /#\/[\w/?=&.-]*/g,
    (hash) =>
      `<a data-hash="${hash}" target="_blank" rel="noopener">${hash}</a>`,
  );
}

export interface ReviewPageInput {
  readonly plan: ReviewPlan;
  readonly built: readonly BuiltCharacter[];
  readonly checklist: readonly ChecklistItem[];
  readonly base: string;
  readonly packFile: string;
  readonly backupFile: string;
  readonly reviewPack: ContentPackManifest;
  readonly sourcePack: ContentPackManifest;
  readonly generatedAt: string;
}

export function renderReviewPage(input: ReviewPageInput): {
  html: string;
  unmapped: readonly ChecklistItem[];
  unknownKeys: readonly string[];
} {
  const { plan, built, checklist } = input;
  const used = new Map<ChecklistItem, string[]>();
  const unknownKeys = new Set<string>();
  const builtBySlug = new Map(
    built.map((character) => [character.slug, character]),
  );

  const itemRow = (
    scope: string,
    [name, note]: readonly [string, string],
    anchor: string,
    where: string,
  ) => {
    const item = matchItem(checklist, name);
    if (item === undefined) {
      unknownKeys.add(name);
      return `<li class="item missing-item"><span>Plan names a checklist item that no longer exists: <strong>${escapeHtml(name)}</strong></span></li>`;
    }
    used.set(item, [
      ...(used.get(item) ?? []),
      `<a href="#${anchor}">${escapeHtml(where)}</a>`,
    ]);
    const id = `${scope}|${normalizeTitle(item.title)}`;
    return `<li class="item"><label><input type="checkbox" data-check="${escapeHtml(id)}"><span class="item-title">${inline(item.title)}</span></label><p class="note">${inline(note)}</p><details><summary>Checklist text</summary><div class="item-body">${itemBodyHtml(item.body)}</div></details></li>`;
  };

  const linkBlock = (
    slug: string,
    characterId: string,
    link: ReviewLink,
    index: number,
    title: string,
  ) => {
    const anchor = `${slug}-${index}`;
    const hash = hashFor(characterId, link.path);
    return `<section class="link" id="${anchor}"><h4><a class="app-link" data-hash="${escapeHtml(hash)}" data-char="${escapeHtml(characterId)}" target="_blank" rel="noopener">${escapeHtml(link.label)}</a> <code class="hash">${escapeHtml(hash.replace(/^#\/characters\/[^/?]+/, "…"))}</code></h4><ul class="items">${link.items
      .map((entry) =>
        itemRow(`${slug}|${index}`, entry, anchor, `${title}: ${link.label}`),
      )
      .join("")}</ul></section>`;
  };

  const factsHtml = (character: BuiltCharacter) => {
    const { facts } = character;
    const identity = Object.entries(facts.identity)
      .filter(([label]) =>
        [
          "Race",
          "Class",
          "Theme",
          "ParagonPath",
          "EpicDestiny",
          "Deity",
          "Background",
        ].includes(label),
      )
      .map(
        ([label, value]) =>
          `<dt>${escapeHtml(label.replace(/([a-z])([A-Z])/g, "$1 $2"))}</dt><dd>${escapeHtml(value)}</dd>`,
      )
      .join("");
    const status = `${facts.complete ? "complete" : '<strong class="bad">incomplete</strong>'}, ${facts.legal ? "legal" : facts.expectLegal === false ? "not legal (intended)" : '<strong class="bad">not legal</strong>'}`;
    const missing = facts.required.filter(({ present }) => !present);
    const rows = [
      `<dt>Level</dt><dd>${facts.level}</dd>`,
      identity,
      facts.companion === undefined
        ? ""
        : `<dt>Companion</dt><dd>${escapeHtml(facts.companion)}</dd>`,
      facts.familiar === undefined
        ? ""
        : `<dt>Familiar</dt><dd>${escapeHtml(facts.familiar)}</dd>`,
      facts.equipped.length === 0
        ? ""
        : `<dt>Equipped</dt><dd>${escapeHtml(facts.equipped.join("; "))}</dd>`,
      facts.known.length === 0
        ? ""
        : `<dt>Known rituals</dt><dd>${escapeHtml(facts.known.join("; "))}</dd>`,
      `<dt>Status</dt><dd>${status}</dd>`,
      missing.length === 0
        ? ""
        : `<dt>Missing</dt><dd class="bad">${escapeHtml(missing.map(({ name }) => name).join(", "))} (the review needs these; rebuild after fixing the plan)</dd>`,
    ].join("");
    const diagnostics =
      facts.diagnostics.length === 0
        ? ""
        : `<details class="diagnostics"><summary>${facts.diagnostics.length} diagnostic${facts.diagnostics.length === 1 ? "" : "s"}</summary><ul>${facts.diagnostics.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></details>`;
    return `<dl class="facts">${rows}</dl>${diagnostics}`;
  };

  const characterSections = plan.reviews
    .map((review) => {
      const character = builtBySlug.get(review.spec.slug);
      if (character === undefined) return "";
      const { slug, title } = review.spec;
      const variants = (review.variants ?? [])
        .map((variant) => {
          const copy = builtBySlug.get(variant.slug);
          return copy === undefined
            ? ""
            : `<li><a class="app-link" data-hash="#/characters" target="_blank" rel="noopener">${escapeHtml(variant.title)}</a> — ${escapeHtml(variant.purpose)}</li>`;
        })
        .join("");
      const manual =
        character.facts.restorable || review.spec.kind !== "import"
          ? ""
          : `<div class="manual"><p><strong>Not in the backup:</strong> the app's backup restore rejects this record (its legacy per-level loot entries have negative quantities), so import it by hand: library <strong>Import</strong> → <code>${escapeHtml(review.spec.source)}</code>. Then open it and paste its ID (from the address bar, after <code>#/characters/</code>) here so the links below point at it:</p><label>Character ID <input type="text" data-id-for="${escapeHtml(character.record.id)}" placeholder="paste the imported character's ID"></label></div>`;
      return `<article class="character" id="${slug}"><h2>${escapeHtml(title)}</h2><p class="purpose">${escapeHtml(review.purpose)}</p>${manual}${factsHtml(character)}${variants === "" ? "" : `<p class="variants-label">Copies for library checks (see General):</p><ul class="variants">${variants}</ul>`}${review.links
        .map((link, index) =>
          linkBlock(slug, character.record.id, link, index, title),
        )
        .join("")}</article>`;
    })
    .join("");

  const generalSections = plan.general
    .map((section, index) => {
      const anchor = `general-${index}`;
      return `<section class="link" id="${anchor}"><h3>${escapeHtml(section.title)}</h3><p class="steps">${stepsHtml(section.steps)}</p><ul class="items">${section.items
        .map((entry) =>
          itemRow(
            `general|${index}`,
            entry,
            anchor,
            `General: ${section.title}`,
          ),
        )
        .join("")}</ul></section>`;
    })
    .join("");

  const unmapped = checklist.filter((item) => !used.has(item));
  const unmappedSection =
    unmapped.length === 0
      ? ""
      : `<article class="character unmapped" id="unmapped"><h2>Not yet mapped (${unmapped.length})</h2><p class="purpose">New checklist items no review page names yet. Check them by hand, or map them in scripts/visual-review-plan.ts and rebuild.</p><ul class="items">${unmapped
          .map((item) => {
            const id = `unmapped|${normalizeTitle(item.title)}`;
            return `<li class="item"><label><input type="checkbox" data-check="${escapeHtml(id)}"><span class="item-title">${inline(item.title)}</span></label><p class="note">${escapeHtml(item.section)}</p><div class="item-body">${itemBodyHtml(item.body)}</div></li>`;
          })
          .join("")}</ul></article>`;

  const index = checklist
    .map((item) => {
      const places = used.get(item);
      return `<tr><td>${escapeHtml(item.section)}</td><td>${inline(item.title)}</td><td>${places === undefined ? '<a href="#unmapped" class="bad">unmapped</a>' : [...new Set(places)].join("<br>")}</td></tr>`;
    })
    .join("");

  const toc = plan.reviews
    .filter(({ spec }) => builtBySlug.has(spec.slug))
    .map(
      ({ spec }) =>
        `<li><a href="#${spec.slug}">${escapeHtml(spec.title)}</a></li>`,
    )
    .join("");
  const count = built.filter(({ facts }) => facts.restorable).length;
  const { reviewPack, sourcePack } = input;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual Review Harness</title>
<style>
:root{--bg:#f6f4ee;--panel:#fffdf8;--ink:#1f2328;--muted:#5d646d;--line:#d9d4c7;--accent:#1d4e89;--bad:#a4262c;--done:#2b7a3d;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15181c;--panel:#1d2126;--ink:#e6e3dc;--muted:#a3a9b1;--line:#353b43;--accent:#8db8ef;--bad:#ff8a8f;--done:#7fd18f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#15181c;--panel:#1d2126;--ink:#e6e3dc;--muted:#a3a9b1;--line:#353b43;--accent:#8db8ef;--bad:#ff8a8f;--done:#7fd18f;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:62rem;margin:0 auto;padding:1rem 16px 4rem}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:.6rem 0;display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center}
header h1{font-size:1.15rem;margin:0;flex:1 1 auto}
header label{display:flex;gap:.4rem;align-items:center;font-size:.9rem}
header input[type=url]{width:15rem;max-width:60vw;padding:.25rem .4rem;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--ink)}
button{font:inherit;padding:.25rem .6rem;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--ink);cursor:pointer}
.progress{font-variant-numeric:tabular-nums;color:var(--muted)}
h2{font-size:1.25rem;margin:0 0 .25rem}
h3{font-size:1.05rem;margin:0 0 .4rem}
h4{font-size:.98rem;margin:0 0 .35rem;display:flex;flex-wrap:wrap;gap:.25rem .6rem;align-items:baseline}
a{color:var(--accent)}
code{font:.85em ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.hash{color:var(--muted);font-weight:400}
.panel,.character{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:1rem;margin:1rem 0}
.purpose{margin:.1rem 0 .6rem;color:var(--muted)}
.facts{display:grid;grid-template-columns:max-content 1fr;gap:.1rem .9rem;margin:0 0 .6rem;font-size:.92rem}
.facts dt{color:var(--muted)}
.facts dd{margin:0;overflow-wrap:anywhere}
.bad{color:var(--bad)}
.link{border-top:1px solid var(--line);padding-top:.7rem;margin-top:.7rem}
.items{list-style:none;margin:0;padding:0}
.item{margin:.35rem 0 .6rem}
.item label{display:flex;gap:.5rem;align-items:flex-start;cursor:pointer;font-weight:600}
.item input{margin-top:.25rem;width:1.05rem;height:1.05rem;flex:none}
.item.done .item-title{color:var(--done);text-decoration:line-through}
.note{margin:.1rem 0 0 1.55rem}
.item details,.item>.item-body{margin:.15rem 0 0 1.55rem;font-size:.9rem;color:var(--muted)}
.item-body p{margin:.2rem 0}
.item-body ul{margin:.2rem 0;padding-left:1.2rem}
.diagnostics{font-size:.88rem;color:var(--muted);margin-bottom:.4rem}
.variants-label{margin:.4rem 0 0;font-size:.92rem}
.manual{border-left:3px solid var(--bad);padding:.2rem .7rem;margin:.4rem 0 .6rem}.manual input{width:22rem;max-width:100%;padding:.25rem .4rem;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--ink)}
.variants{margin:.2rem 0 .4rem;font-size:.92rem}
ol.steps-list li{margin:.35rem 0}
.toc{columns:2 18rem;padding-left:1.2rem}
table{border-collapse:collapse;width:100%;font-size:.88rem}
td{border-top:1px solid var(--line);padding:.3rem .4rem;vertical-align:top}
.table-wrap{overflow-x:auto}
@media (max-width:40rem){header input[type=url]{width:100%;max-width:none}header label{flex:1 1 100%}}
</style>
</head>
<body>
<main>
<header>
<h1>Visual review (${built.length} characters)</h1>
<label>App base URL <input type="url" id="base" value="${escapeHtml(input.base)}"></label>
<span class="progress" id="progress"></span>
<button type="button" id="theme">Theme</button>
<button type="button" id="reset">Clear checks</button>
</header>

<section class="panel" id="before">
<h2>Before you start</h2>
<ol class="steps-list">
<li>Start the dev server if it isn't running: <code>nix develop path:. -c pnpm dev</code> (this page links to the base URL above; change it if Vite chose another port).</li>
<li>Optional but cleanest: open the base URL in a <strong>private window</strong>, so the review content and characters don't mix with your own library.</li>
<li>Open <a data-hash="#/settings" target="_blank" rel="noopener">Settings</a> → Content → <strong>Import content pack…</strong> and choose <code>${escapeHtml(input.packFile)}</code>. It is <code>tmp/content/full-local.4ecp</code> (${escapeHtml(sourcePack.packId)}, digest ${escapeHtml(sourcePack.contentDigest.slice(0, 12))}) under its own pack ID, <code>${escapeHtml(reviewPack.packId)}</code>, so it installs beside any other revision of ${escapeHtml(sourcePack.packId)}.</li>
<li>In the content table, tick <strong>Use ${escapeHtml(reviewPack.name)}</strong> and untick every other row. The characters are pinned to the content made of that pack alone; with other content on, they show a content-update issue (don't apply it).</li>
<li>Settings → Backups &amp; storage → <strong>Restore backup</strong>, choose <code>${escapeHtml(input.backupFile)}</code>, then <strong>Restore ${count} characters</strong>. Restore keeps the character IDs, so the links below work; restoring again (after <code>pnpm review:build</code>) resets them. Use Restore, not the library's Import: Import gives an already-present ID a fresh one.</li>
<li>Check items off as you go (kept in this browser). Afterwards, re-enable your own content and trash the review characters (their titles start with "Review –").</li>
</ol>
<p>Generated ${escapeHtml(input.generatedAt)} from <code>docs/visual-review-checklist.md</code> (${checklist.length} items${unmapped.length === 0 ? "" : `, <a href="#unmapped" class="bad">${unmapped.length} not yet mapped</a>`}). Rebuild with <code>nix develop path:. -c pnpm review:build</code>.</p>
<ul class="toc">${toc}<li><a href="#general">General</a></li><li><a href="#coverage">Coverage index</a></li></ul>
</section>

${characterSections}

<article class="character" id="general"><h2>General</h2><p class="purpose">Items not tied to one character's page.</p>${generalSections}</article>

${unmappedSection}

<article class="character" id="coverage"><h2>Coverage index</h2><p class="purpose">Every checklist item and where this page asks for it.</p><div class="table-wrap"><table><tbody>${index}</tbody></table></div></article>
</main>
<script>
(function () {
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  };
  var PREFIX = "4ecb-visual-review:";
  var baseInput = document.getElementById("base");
  var savedBase = store.get(PREFIX + "base");
  if (savedBase) baseInput.value = savedBase;
  var idInputs = Array.prototype.slice.call(document.querySelectorAll("input[data-id-for]"));
  idInputs.forEach(function (input) {
    input.value = store.get(PREFIX + "id:" + input.getAttribute("data-id-for")) || "";
    input.addEventListener("input", function () {
      store.set(PREFIX + "id:" + input.getAttribute("data-id-for"), input.value.trim());
      applyBase();
    });
  });
  function applyBase() {
    var base = baseInput.value.trim().replace(/\\/+$/, "");
    var ids = {};
    idInputs.forEach(function (input) { if (input.value.trim()) ids[input.getAttribute("data-id-for")] = input.value.trim(); });
    document.querySelectorAll("a[data-hash]").forEach(function (a) {
      var hash = a.getAttribute("data-hash");
      var original = a.getAttribute("data-char");
      if (original && ids[original]) hash = hash.replace(encodeURIComponent(original), encodeURIComponent(ids[original]));
      a.href = base + "/" + hash;
    });
  }
  baseInput.addEventListener("input", function () { store.set(PREFIX + "base", baseInput.value.trim()); applyBase(); });
  applyBase();
  var boxes = Array.prototype.slice.call(document.querySelectorAll("input[data-check]"));
  var progress = document.getElementById("progress");
  function update() {
    var done = 0;
    boxes.forEach(function (box) {
      box.closest(".item").classList.toggle("done", box.checked);
      if (box.checked) done += 1;
    });
    progress.textContent = done + " / " + boxes.length + " checked";
  }
  boxes.forEach(function (box) {
    box.checked = store.get(PREFIX + box.getAttribute("data-check")) === "1";
    box.addEventListener("change", function () {
      if (box.checked) store.set(PREFIX + box.getAttribute("data-check"), "1");
      else store.del(PREFIX + box.getAttribute("data-check"));
      update();
    });
  });
  document.getElementById("reset").addEventListener("click", function () {
    if (!window.confirm("Clear every check on this page?")) return;
    boxes.forEach(function (box) { box.checked = false; store.del(PREFIX + box.getAttribute("data-check")); });
    update();
  });
  var root = document.documentElement;
  var theme = store.get(PREFIX + "theme");
  if (theme) root.setAttribute("data-theme", theme);
  document.getElementById("theme").addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") === "dark" ||
      (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    store.set(PREFIX + "theme", next);
  });
  update();
})();
</script>
</body>
</html>
`;
  return { html, unmapped, unknownKeys: [...unknownKeys] };
}

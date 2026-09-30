import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

class CdpClient {
  #id = 0;
  #pending = new Map();
  #listeners = new Map();
  #socket;

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.#socket.addEventListener("open", resolve, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
    });
    this.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        if (pending === undefined) return;
        this.#pending.delete(message.id);
        if (message.error === undefined) pending.resolve(message.result ?? {});
        else pending.reject(new Error(message.error.message));
        return;
      }
      for (const listener of this.#listeners.get(message.method) ?? [])
        listener(message.params ?? {});
    });
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    this.#listeners.set(method, [
      ...(this.#listeners.get(method) ?? []),
      listener,
    ]);
  }

  close() {
    this.#socket.close();
  }
}

const execute = promisify(execFile);
const projectRoot = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), "4ecb-print-check-"));
const browserProfile = join(scratch, "chromium-profile");
const previewPort = await availablePort();
const debugPort = await availablePort();
const preview = spawn(
  "pnpm",
  [
    "--filter",
    "@4ecb/web",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(previewPort),
  ],
  { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
);
const chromium = spawn(
  "chromium",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${browserProfile}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    "about:blank",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let client;
try {
  await waitForHttp(`http://127.0.0.1:${previewPort}/`);
  const target = await waitForTarget(debugPort);
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  const browserMessages = [];
  client.on("Log.entryAdded", (params) => {
    if (["error", "warning"].includes(params.entry?.level))
      browserMessages.push(params.entry.text);
  });
  client.on("Runtime.exceptionThrown", (params) => {
    browserMessages.push(
      params.exceptionDetails?.exception?.description ??
        params.exceptionDetails?.text ??
        "Unidentified browser exception",
    );
  });

  const origin = `http://127.0.0.1:${previewPort}`;
  await navigate(client, `${origin}/#/settings`);
  await waitForExpression(
    client,
    `document.querySelector(".settings-page h2")?.textContent === "Settings" && document.body.textContent.includes("Content")`,
  );
  const styleContract = await evaluate(
    client,
    `(() => {
      const fixture = document.createElement("div");
      fixture.id = "computed-style-contract";
      fixture.innerHTML = \`
        <h4 class="selection-section-heading" data-style="section-a">Section</h4>
        <h5 class="selection-section-heading" data-style="section-b">Section</h5>
        <h4 class="selection-section-heading selection-section-heading--panel" data-style="panel">Panel</h4>
        <h4 class="selection-section-heading selection-section-heading--compact" data-style="compact">Compact</h4>
        <h5 class="selection-subsection-heading" data-style="subsection-a">Subsection</h5>
        <legend class="selection-subsection-heading" data-style="subsection-b">Subsection</legend>
        <div class="selection-table-scroll"><table><tbody><tr class="selection-type-row table-section-row" data-style="table-section-row"><th colspan="2" data-style="table-section-cell"><button class="table-section-toggle" data-style="table-section-toggle" type="button"><span>Category</span><small class="table-section-count">1</small></button></th></tr></tbody></table></div>
        <button class="button-primary" data-style="primary-button" type="button">Primary</button>
        <button class="dialog-close" data-style="dialog-close" type="button">Close</button>
        <aside class="candidate-detail tone-item"><header class="primary-detail-heading entity-card-header" data-style="ordinary-header">Header</header><p class="candidate-flavor entity-card-flavor">Flavor</p></aside>
        <aside class="candidate-detail tone-item top-level-power-card"><header class="primary-detail-heading entity-card-header" data-style="power-header">Header</header><p class="candidate-flavor entity-card-flavor" data-style="power-flavor">Flavor</p></aside>
        <aside class="candidate-detail tone-item composed-item-card"><header class="primary-detail-heading entity-card-header" data-style="item-header">Header</header><p class="candidate-flavor entity-card-flavor composed-item-flavor" data-style="item-flavor">Flavor</p></aside>
      \`;
      document.body.append(fixture);
      const metrics = (name) => {
        const element = fixture.querySelector(\`[data-style="\${name}"]\`);
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          marginBottom: style.marginBottom,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          backgroundColor: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          borderRightColor: style.borderRightColor,
          color: style.color,
          height: element.getBoundingClientRect().height,
        };
      };
      const result = Object.fromEntries([
        "section-a", "section-b", "panel", "compact",
        "subsection-a", "subsection-b", "table-section-row", "table-section-cell",
        "table-section-toggle", "primary-button", "dialog-close", "ordinary-header",
        "power-header", "power-flavor", "item-header", "item-flavor"
      ].map((name) => [name, metrics(name)]));
      fixture.remove();
      return result;
    })()`,
  );
  assert(
    styleContract["section-a"].fontSize ===
      styleContract["section-b"].fontSize &&
      styleContract["section-a"].fontWeight ===
        styleContract["section-b"].fontWeight &&
      styleContract["section-a"].lineHeight ===
        styleContract["section-b"].lineHeight,
    "section heading elements do not share one computed typography contract",
  );
  assert(
    styleContract["section-a"].fontSize === "15.2px" &&
      styleContract["section-a"].fontWeight === "800" &&
      styleContract["section-a"].lineHeight === "20.52px",
    `section heading contract changed: ${JSON.stringify(styleContract["section-a"])}`,
  );
  assert(
    styleContract.panel.fontSize === "14.4px" &&
      styleContract.compact.fontSize === "13.12px",
    `named heading variants changed: ${JSON.stringify(styleContract)}`,
  );
  assert(
    styleContract["subsection-a"].fontSize ===
      styleContract["subsection-b"].fontSize &&
      styleContract["subsection-a"].fontWeight ===
        styleContract["subsection-b"].fontWeight &&
      styleContract["subsection-a"].lineHeight ===
        styleContract["subsection-b"].lineHeight,
    "subsection heading elements do not share one computed typography contract",
  );
  assert(
    styleContract["subsection-a"].fontSize === "13.6px" &&
      styleContract["subsection-a"].fontWeight === "800" &&
      styleContract["subsection-a"].lineHeight === "20.4px",
    `subsection heading contract changed: ${JSON.stringify(styleContract["subsection-a"])}`,
  );
  assert(
    styleContract["table-section-cell"].paddingTop === "0px" &&
      styleContract["table-section-cell"].paddingBottom === "0px" &&
      styleContract["table-section-toggle"].paddingTop === "7.2px" &&
      styleContract["table-section-toggle"].paddingBottom === "7.2px" &&
      styleContract["table-section-row"].height >= 34 &&
      styleContract["table-section-row"].height < 34.2,
    `table-section row rhythm changed: ${JSON.stringify(styleContract)}`,
  );
  assert(
    styleContract["primary-button"].backgroundColor === "rgb(126, 174, 210)" &&
      styleContract["primary-button"].borderRightColor ===
        "rgb(114, 193, 240)" &&
      styleContract["primary-button"].color === "rgb(24, 34, 57)" &&
      styleContract["dialog-close"].backgroundColor === "rgba(0, 0, 0, 0)",
    `shared button contracts changed: ${JSON.stringify(styleContract)}`,
  );
  assert(
    // An ordinary header immediately followed by flavor text now also
    // zeroes its own bottom margin (matching the power/composed-item
    // cases below), since the flavor element supplies its own top padding
    // and the two used to stack into a doubled, uneven gap.
    styleContract["ordinary-header"].marginBottom === "0px" &&
      styleContract["power-header"].marginBottom === "0px" &&
      styleContract["item-header"].marginBottom === "0px",
    `detail-card header rhythm changed: ${JSON.stringify(styleContract)}`,
  );
  assert(
    styleContract["power-flavor"].paddingBottom === "10.4px" &&
      styleContract["item-flavor"].paddingTop === "11.2px" &&
      styleContract["item-flavor"].paddingBottom === "10.32px",
    `detail-card flavor rhythm changed: ${JSON.stringify(styleContract)}`,
  );
  const character = printCharacter();
  await evaluate(
    client,
    `(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("4ecb");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("characters", "readwrite");
        transaction.objectStore("characters").put(${JSON.stringify(character)});
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
      return true;
    })()`,
    true,
  );

  const chromiumResults = [];
  for (const variant of [
    { name: "letter-color", paper: "letter", monochrome: false },
    { name: "letter-monochrome", paper: "letter", monochrome: true },
    { name: "a4-color", paper: "a4", monochrome: false },
    { name: "a4-monochrome", paper: "a4", monochrome: true },
  ]) {
    await updateSheetSettings(client, character.id, variant);
    await navigate(
      client,
      `${origin}/?print=${encodeURIComponent(variant.name)}#/characters/${character.id}`,
    );
    await waitForExpression(
      client,
      `document.body.textContent.includes("${character.title}") && document.querySelectorAll(".print-only .print-reference-card").length === 24`,
    );
    await client.send("Emulation.setEmulatedMedia", { media: "print" });
    const layout = await evaluate(
      client,
      `(() => {
        const cards = [...document.querySelectorAll(".print-only .print-reference-card")];
        const overflowing = cards.filter((card) =>
          card.scrollHeight > card.clientHeight + 1 ||
          card.scrollWidth > card.clientWidth + 1
        ).map((card) => card.querySelector("h3")?.textContent ?? "unnamed");
        const hidden = [
          ".app-header", ".pwa-status",
          ".screen-sheet-view", ".print-preview-toolbar", ".sheet-toolbar", ".cache-warning", ".sheet-page > .status"
        ].every((selector) => {
          const element = document.querySelector(selector);
          return element === null || getComputedStyle(element).display === "none";
        });
        const header = document.querySelector(".print-item-card > header");
        const style = header === null ? undefined : getComputedStyle(header);
        return {
          cardCount: cards.length,
          overflowing,
          applicationChromeHidden: hidden,
          itemHeaderBackground: style?.backgroundColor,
          itemHeaderColor: style?.color,
        };
      })()`,
    );
    assert(layout.applicationChromeHidden, `${variant.name} prints app chrome`);
    assert(
      layout.cardCount === 24,
      `${variant.name} did not render every card`,
    );
    assert(
      layout.overflowing.length === 0,
      `${variant.name} clips cards: ${layout.overflowing.join(", ")}`,
    );
    if (variant.monochrome) {
      assert(
        layout.itemHeaderBackground === "rgb(255, 255, 255)" &&
          layout.itemHeaderColor === "rgb(17, 17, 17)",
        `${variant.name} did not apply monochrome card colors: ${layout.itemHeaderBackground} / ${layout.itemHeaderColor}`,
      );
    }

    const pdf = await client.send("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
    });
    const pdfPath = join(scratch, `${variant.name}.pdf`);
    await writeFile(pdfPath, Buffer.from(pdf.data, "base64"));
    const evidence = await inspectPdf(pdfPath, variant.paper);
    chromiumResults.push({ ...variant, ...layout, ...evidence });
  }

  assert(browserMessages.length === 0, browserMessages.join("\n"));
  const firefoxResults = await firefoxPrintMatrix(character, origin, scratch);
  console.log(
    JSON.stringify(
      {
        chromium: await chromiumVersion(),
        fixture: {
          character: character.title,
          powers: character.snapshot.powers.length,
          itemCards: character.snapshot.loot.length,
          blankHitPoints: character.sheetSettings.blankHitPoints,
        },
        chromiumResults,
        firefox: await firefoxVersion(),
        firefoxResults,
      },
      null,
      2,
    ),
  );
} finally {
  client?.close();
  chromium.kill("SIGTERM");
  preview.kill("SIGTERM");
  await Promise.allSettled([processExit(chromium), processExit(preview)]);
  await rm(scratch, { recursive: true, force: true });
}

async function firefoxPrintMatrix(character, origin, outputDirectory) {
  const port = await availablePort();
  const driver = spawn("geckodriver", ["--port", String(port)], {
    stdio: "ignore",
  });
  let sessionId;
  try {
    await waitForHttp(`http://127.0.0.1:${port}/status`);
    const session = await webdriverRequest(port, "/session", "POST", {
      capabilities: {
        alwaysMatch: {
          browserName: "firefox",
          "moz:firefoxOptions": { args: ["-headless"] },
        },
      },
    });
    sessionId = session.sessionId;
    await webdriverNavigate(port, sessionId, `${origin}/#/settings`);
    await webdriverWait(
      port,
      sessionId,
      `return document.querySelector(".settings-page h2")?.textContent === "Settings" && document.body.textContent.includes("Content")`,
    );
    await webdriverExecuteAsync(
      port,
      sessionId,
      `const character = arguments[0];
       const done = arguments[arguments.length - 1];
       (async () => {
         const database = await new Promise((resolve, reject) => {
           const request = indexedDB.open("4ecb");
           request.onsuccess = () => resolve(request.result);
           request.onerror = () => reject(request.error);
         });
         await new Promise((resolve, reject) => {
           const transaction = database.transaction("characters", "readwrite");
           transaction.objectStore("characters").put(character);
           transaction.oncomplete = () => resolve();
           transaction.onerror = () => reject(transaction.error);
           transaction.onabort = () => reject(transaction.error);
         });
         database.close();
         done(true);
       })().catch((error) => done({ error: String(error) }));`,
      [character],
    );

    const results = [];
    for (const variant of [
      { name: "letter-color", paper: "letter", monochrome: false },
      { name: "letter-monochrome", paper: "letter", monochrome: true },
      { name: "a4-color", paper: "a4", monochrome: false },
      { name: "a4-monochrome", paper: "a4", monochrome: true },
    ]) {
      await webdriverExecuteAsync(
        port,
        sessionId,
        `const [id, paper, monochrome] = arguments;
         const done = arguments[arguments.length - 1];
         (async () => {
           const database = await new Promise((resolve, reject) => {
             const request = indexedDB.open("4ecb");
             request.onsuccess = () => resolve(request.result);
             request.onerror = () => reject(request.error);
           });
           const character = await new Promise((resolve, reject) => {
             const request = database.transaction("characters").objectStore("characters").get(id);
             request.onsuccess = () => resolve(request.result);
             request.onerror = () => reject(request.error);
           });
           character.sheetSettings = { ...character.sheetSettings, paper, monochrome };
           await new Promise((resolve, reject) => {
             const transaction = database.transaction("characters", "readwrite");
             transaction.objectStore("characters").put(character);
             transaction.oncomplete = () => resolve();
             transaction.onerror = () => reject(transaction.error);
             transaction.onabort = () => reject(transaction.error);
           });
           database.close();
           done(true);
         })().catch((error) => done({ error: String(error) }));`,
        [character.id, variant.paper, variant.monochrome],
      );
      await webdriverNavigate(
        port,
        sessionId,
        `${origin}/?firefox-print=${encodeURIComponent(variant.name)}#/characters/${character.id}`,
      );
      await webdriverWait(
        port,
        sessionId,
        `const sheet = document.querySelector(".sheet-page");
         return document.body.textContent.includes("${character.title}") &&
           document.querySelectorAll(".print-only .print-reference-card").length === 24 &&
           sheet?.classList.contains("paper-${variant.paper}") === true &&
           sheet?.classList.contains("sheet-monochrome") === ${variant.monochrome} &&
           document.querySelector('link[data-print-paper="${variant.paper}"]') !== null;`,
      );
      const layout = await webdriverExecute(
        port,
        sessionId,
        `const cards = [...document.querySelectorAll(".print-only .print-reference-card")];
         const overflowing = cards.filter((card) =>
           card.scrollHeight > card.clientHeight + 1 ||
           card.scrollWidth > card.clientWidth + 1
         ).map((card) => card.querySelector("h3")?.textContent ?? "unnamed");
         const header = document.querySelector(".print-item-card > header");
         const style = header === null ? undefined : getComputedStyle(header);
         return {
           cardCount: cards.length,
           overflowing,
           itemHeaderBackground: style?.backgroundColor,
           itemHeaderColor: style?.color,
         };`,
      );
      assert(
        layout.cardCount === 24,
        `Firefox ${variant.name} did not render every card`,
      );
      assert(
        layout.overflowing.length === 0,
        `Firefox ${variant.name} clips cards: ${layout.overflowing.join(", ")}`,
      );
      if (variant.monochrome)
        assert(
          layout.itemHeaderBackground === "rgb(255, 255, 255)" &&
            layout.itemHeaderColor === "rgb(17, 17, 17)",
          `Firefox ${variant.name} did not apply monochrome colors`,
        );
      const printed = await webdriverRequest(
        port,
        `/session/${sessionId}/print`,
        "POST",
        {
          background: true,
          shrinkToFit: true,
          page:
            variant.paper === "letter"
              ? { width: 21.59, height: 27.94 }
              : { width: 21, height: 29.7 },
        },
      );
      const path = join(outputDirectory, `firefox-${variant.name}.pdf`);
      await writeFile(path, Buffer.from(printed, "base64"));
      const evidence = await inspectPdf(path, variant.paper, false);
      results.push({ ...variant, ...layout, ...evidence });
    }
    return results;
  } finally {
    if (sessionId !== undefined)
      await webdriverRequest(port, `/session/${sessionId}`, "DELETE").catch(
        () => undefined,
      );
    driver.kill("SIGTERM");
    await processExit(driver);
  }
}

function printCharacter() {
  const longText =
    "Make a primary attack, then shift one square without provoking opportunity actions. " +
    "On a hit, the target is marked until the end of your next turn. An adjacent ally may move one square as a free action.";
  const powers = Array.from({ length: 18 }, (_, index) => ({
    name: `Synthetic power ${String(index + 1).padStart(2, "0")}`,
    id: `POWER_PRINT_${index + 1}`,
    usage: ["At-Will", "Encounter", "Daily"][index % 3],
    actionType: index % 2 === 0 ? "Standard Action" : "Minor Action",
    keywords: "Martial, Weapon",
    attackType: "Melee weapon",
    target: "One creature",
    description: index % 2 === 0 ? longText : "Move one square, then attack.",
    source: "Synthetic print fixture",
    level: String((index % 30) + 1),
    weapons: [
      {
        name: "Synthetic blade",
        attackBonus: String(8 + (index % 7)),
        damage: `${index % 2 === 0 ? "2d8" : "1d8"}+5`,
        defense: "AC",
      },
    ],
  }));
  const loot = Array.from({ length: 6 }, (_, index) => ({
    name: `Synthetic item ${String(index + 1).padStart(2, "0")}`,
    count: index + 1,
    equippedCount: index < 2 ? 1 : 0,
    showPowerCard: true,
    elements: [
      {
        id: `ITEM_PRINT_${index + 1}`,
        name: `Synthetic item ${String(index + 1).padStart(2, "0")}`,
        type: "Magic Item",
        description: index % 2 === 0 ? longText : "A compact synthetic item.",
      },
    ],
  }));
  const stats = {
    Strength: "18",
    Constitution: "14",
    Dexterity: "16",
    Intelligence: "12",
    Wisdom: "13",
    Charisma: "10",
    AC: "24",
    Fortitude: "21",
    Reflex: "22",
    Will: "19",
    "Hit Points": "72",
    "Healing Surges": "10",
    "Healing Surge Value": "18",
    "Action Point": "1",
    Speed: "6",
    Initiative: "+9",
    "Passive Insight": "18",
    "Passive Perception": "20",
    Acrobatics: "+12",
    Arcana: "+8",
    Athletics: "+14",
    Endurance: "+11",
    History: "+8",
    Insight: "+8",
    Perception: "+10",
    Stealth: "+12",
  };
  return {
    schemaVersion: 2,
    id: "synthetic-print-character",
    title: "Synthetic print fixture hero",
    notes: "Public synthetic print fixture",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    legacy: { format: "dnd4e", sourceXml: "<D20Character/>" },
    snapshot: {
      details: {
        name: "Synthetic print fixture hero",
        Level: "18",
        Race: "Synthetic ancestry",
        Class: "Synthetic guardian",
        Player: "Public fixture",
        Notes: "Long and short cards exercise deterministic pagination.",
      },
      abilities: {},
      stats,
      selectedRules: [
        {
          id: "FEATURE_PRINT_1",
          name: "Synthetic resilience",
          type: "Class Feature",
          description: "Gain a bonus while testing printed feature groups.",
        },
        {
          id: "FEAT_PRINT_1",
          name: "Synthetic focus",
          type: "Feat",
          description: "A public fixture feat with readable rules text.",
        },
      ],
      powers,
      loot,
      textStrings: {},
      levelCount: 18,
      source: "legacy-cache",
    },
    build: {
      formatVersion: 1,
      effectiveLevel: 18,
      levels: [],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    },
    sheetSettings: {
      paper: "letter",
      monochrome: false,
      blankHitPoints: true,
      includePowerCards: true,
      includeItemCards: true,
    },
  };
}

async function updateSheetSettings(cdp, id, variant) {
  await evaluate(
    cdp,
    `(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("4ecb");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const character = await new Promise((resolve, reject) => {
        const request = database.transaction("characters").objectStore("characters").get(${JSON.stringify(id)});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      character.sheetSettings = {
        ...character.sheetSettings,
        paper: ${JSON.stringify(variant.paper)},
        monochrome: ${JSON.stringify(variant.monochrome)},
      };
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("characters", "readwrite");
        transaction.objectStore("characters").put(character);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
      return true;
    })()`,
    true,
  );
}

async function inspectPdf(path, paper, requireTagged = true) {
  const [{ stdout: info }, { stdout: text }] = await Promise.all([
    execute("pdfinfo", [path]),
    execute("pdftotext", ["-layout", path, "-"]),
  ]);
  const pages = Number.parseInt(
    info.match(/^Pages:\s+(\d+)$/m)?.[1] ?? "0",
    10,
  );
  const size = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  assert(size !== null, `${path} has no reported page dimensions`);
  const width = Number(size[1]);
  const height = Number(size[2]);
  const expected = paper === "letter" ? [612, 792] : [595.28, 841.89];
  assert(Math.abs(width - expected[0]) < 1, `${path} has width ${width}`);
  assert(Math.abs(height - expected[1]) < 1, `${path} has height ${height}`);
  assert(
    pages === 5,
    `${path} should contain two reference pages and three nine-card pages, got ${pages}`,
  );
  const tagged = /^Tagged:\s+yes$/m.test(info);
  if (requireTagged) assert(tagged, `${path} is not a tagged PDF`);
  const { stdout: pageInfo } = await execute("pdfinfo", [
    "-f",
    "1",
    "-l",
    String(pages),
    "-box",
    path,
  ]);
  const pageSizes = [
    ...pageInfo.matchAll(/^Page\s+\d+\s+size:\s+([\d.]+) x ([\d.]+) pts/gm),
  ];
  assert(
    pageSizes.length === pages,
    `${path} reported ${pageSizes.length} of ${pages} page sizes`,
  );
  for (const page of pageSizes) {
    assert(Math.abs(Number(page[1]) - expected[0]) < 1, `${path} mixes widths`);
    assert(
      Math.abs(Number(page[2]) - expected[1]) < 1,
      `${path} mixes heights`,
    );
  }
  const normalizedText = text.toLocaleLowerCase();
  const compactText = text.replace(/\s+/g, " ");
  for (const required of [
    "Synthetic print fixture hero",
    "Character reference",
    "Synthetic power 01",
    "Synthetic power 18",
    "Synthetic item 01",
    "Synthetic item 06",
  ])
    assert(
      normalizedText.includes(required.toLocaleLowerCase()),
      `${path} is missing text: ${required}`,
    );
  for (const hidden of [
    "Ready offline",
    "Unofficial, local-first software",
    "Print or save PDF",
    "Blank hit points",
    "Monochrome",
  ])
    assert(
      !normalizedText.includes(hidden.toLocaleLowerCase()),
      `${path} includes application chrome: ${hidden}`,
    );
  assert(
    !/Hit Points\s+72/i.test(compactText),
    `${path} did not blank the mutable hit-point value`,
  );
  return { pages, widthPoints: width, heightPoints: height, tagged };
}

async function chromiumVersion() {
  const { stdout } = await execute("chromium", ["--version"]);
  return stdout.trim();
}

async function firefoxVersion() {
  const { stdout } = await execute("firefox", ["--version"]);
  return stdout.trim();
}

async function webdriverRequest(port, path, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json; charset=utf-8" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error !== undefined)
    throw new Error(
      payload.value?.message ??
        `WebDriver ${method} ${path} failed with ${response.status}`,
    );
  return payload.value;
}

async function webdriverNavigate(port, sessionId, url) {
  await webdriverRequest(port, `/session/${sessionId}/url`, "POST", { url });
}

async function webdriverExecute(port, sessionId, script, args = []) {
  return webdriverRequest(port, `/session/${sessionId}/execute/sync`, "POST", {
    script,
    args,
  });
}

async function webdriverExecuteAsync(port, sessionId, script, args = []) {
  const value = await webdriverRequest(
    port,
    `/session/${sessionId}/execute/async`,
    "POST",
    { script, args },
  );
  if (value?.error !== undefined) throw new Error(value.error);
  return value;
}

async function webdriverWait(port, sessionId, script) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await webdriverExecute(port, sessionId, script)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for Firefox expression: ${script}`);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  await new Promise((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return port;
}

async function waitForHttp(url) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json(),
      );
      const target = targets.find((candidate) => candidate.type === "page");
      if (target?.webSocketDebuggerUrl !== undefined) return target;
    } catch {
      // Chromium has not opened its debugging endpoint yet.
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the Chromium debugging target");
}

async function navigate(cdp, url) {
  await cdp.send("Emulation.setEmulatedMedia", { media: "screen" });
  await cdp.send("Page.navigate", { url });
  await waitForExpression(cdp, `document.readyState === "complete"`);
}

async function waitForExpression(cdp, expression) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}`);
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (response.exceptionDetails !== undefined)
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text,
    );
  return response.result?.value;
}

function processExit(child) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

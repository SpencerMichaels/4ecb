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
// Diagnostic for overview work; the default gate still checks every card.
const overviewOnly = process.argv.includes("--overview-only");
const { stdout: variantTableMarkup } = await execute("pnpm", [
  "exec",
  "tsx",
  "--tsconfig",
  "apps/web/tsconfig.app.json",
  "apps/web/scripts/print-power-variant-fixture.tsx",
]);
const installVariantTable = `
  const card = [...document.querySelectorAll(".print-power-card")]
    .find((element) => element.querySelector("h3 > span:last-child")?.textContent === "Synthetic power 03");
  card.querySelector(".print-card-weapon-variants").outerHTML = ${JSON.stringify(variantTableMarkup)};
  window.dispatchEvent(new Event("beforeprint"));
`;
const scratch = await mkdtemp(join(tmpdir(), "4ecb-print-check-"));
const scratchpadPreview = process.argv.includes("--scratchpad-preview")
  ? join(
      await mkdtemp(join(tmpdir(), "4ecb-scratchpad-preview-")),
      "scratchpad.png",
    )
  : undefined;
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
  if (overviewOnly)
    character.snapshot.details.Notes +=
      "\n" +
      Array.from({ length: 1200 }, (_, n) => `continuationword${n}`).join(" ") +
      ". End of preserved overview notes.";
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
    await evaluate(client, `(() => { ${installVariantTable} return true; })()`);
    await evaluate(
      client,
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
      true,
    );
    await waitForExpression(
      client,
      `document.querySelectorAll('.sheet-overview > .ov-paper[aria-label="Character reference"]').length > 0`,
    );
    await checkSummaryPaneFlow(client);
    await checkSummaryPresentation(client, variant.monochrome);
    await checkSummaryContinuation(client);
    await checkScratchpad(client, variant.monochrome);
    if (scratchpadPreview && variant.name === "letter-color") {
      const clip = await evaluate(
        client,
        `(() => {
        const r=document.querySelector('.sheet-overview > .ov-paper[aria-label="Play scratchpad"]').getBoundingClientRect();
        return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};
      })()`,
      );
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip,
      });
      await writeFile(
        scratchpadPreview,
        Buffer.from(screenshot.data, "base64"),
      );
    }
    const overview = await evaluate(
      client,
      `(() => {
      const pages=[...document.querySelectorAll('.sheet-overview .ov-paper')].filter(p=>!p.closest('.ov-measure'));
      return {pageCount:pages.length,cardPages:document.querySelectorAll('.print-card-page').length,overflow:pages.filter(p=>p.querySelector('.sp-page-content').getBoundingClientRect().bottom > p.querySelector('.sp-page-footer').getBoundingClientRect().top-7 || p.scrollWidth > p.clientWidth+1).map(p=>p.getAttribute('aria-label'))};
    })()`,
    );
    assert(
      overview.overflow.length === 0,
      `${variant.name} overflows overview pages: ${overview.overflow.join(", ")}`,
    );
    if (overviewOnly) {
      await evaluate(
        client,
        `(() => { document.querySelectorAll('.print-card-page').forEach(page=>page.classList.add('print-excluded'));return true;})()`,
      );
      const pdf = await client.send("Page.printToPDF", {
        printBackground: true,
        preferCSSPageSize: true,
        generateTaggedPDF: true,
      });
      const path = join(scratch, `${variant.name}-overview.pdf`);
      await writeFile(path, Buffer.from(pdf.data, "base64"));
      const evidence = await inspectPdf(
        path,
        variant.paper,
        true,
        overview.pageCount,
        true,
      );
      chromiumResults.push({ ...variant, ...overview, ...evidence });
      continue;
    }
    const layout = await evaluate(
      client,
      `(() => {
        const cards = [...document.querySelectorAll(".print-only .print-reference-card")];
        const overflowing = cards.filter((card) =>
          card.scrollHeight > card.clientHeight + 1 ||
          card.scrollWidth > card.clientWidth + 1 ||
          [...card.querySelectorAll(".print-card-body")].some((body) =>
            body.scrollHeight > body.clientHeight + 1 ||
            body.getBoundingClientRect().right > card.getBoundingClientRect().right + 1
          )
        ).map((card) => (card.querySelector("h3")?.textContent ?? "unnamed") +
          " (" + card.className + "; body " + card.querySelector(".print-card-body")?.scrollHeight +
          "/" + card.querySelector(".print-card-body")?.clientHeight + "px)");
        const weaponFontMismatch = [...document.querySelectorAll(".print-card-variant-table")]
          .some((line) => getComputedStyle(line).fontSize !==
            getComputedStyle(line.closest(".print-card-body")).fontSize);
        const tables = [...document.querySelectorAll(".print-card-variant-table")];
        const tableFits = tables.length > 0 && tables.every((table) => table.clientWidth > 0 && [...table.querySelectorAll("th, td")].every((cell) =>
          cell.scrollWidth <= cell.clientWidth + 1));
        const shortCard = cards.find((card) => card.querySelector("h3 > span:last-child")?.textContent === "Synthetic power 02");
        const bandOverflow = [...document.querySelectorAll(".print-card-action-band")]
          .flatMap((band) => [...band.children])
          .filter((cell) =>
            cell.scrollHeight > cell.clientHeight + 1 ||
            cell.scrollWidth > cell.clientWidth + 1
          ).map((cell) => (cell.textContent?.trim() ?? "unnamed") +
            " (" + cell.scrollWidth + "/" + cell.clientWidth + "px wide, " +
            cell.scrollHeight + "/" + cell.clientHeight + "px tall)");
        const targetOverflow = [...document.querySelectorAll(".print-card-combat-band")]
          .flatMap((band) => band.children[1]?.querySelector("dd") ?? [])
          .filter((target) =>
            target.scrollHeight > target.clientHeight + 1 ||
            target.scrollWidth > target.clientWidth + 1
          ).map((target) => target.textContent?.trim() ?? "unnamed");
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
          additionalEffects: shortCard?.querySelector(".print-card-body .print-card-additional.has-effects")?.textContent,
          overflowing,
          weaponFontMismatch,
          tableFits,
          shortCardFont: shortCard && getComputedStyle(shortCard.querySelector(".print-card-body")).fontSize,
          shortItemFont: getComputedStyle(cards.find((card) => card.querySelector("h3 > span")?.textContent === "Synthetic item 02").querySelector(".print-card-body")).fontSize,
          minimumBodyFont: Math.min(...cards.map((card) => parseFloat(getComputedStyle(card.querySelector(".print-card-body")).fontSize))),
          bandOverflow,
          targetOverflow,
          applicationChromeHidden: hidden,
          itemHeaderBackground: style?.backgroundColor,
          itemHeaderColor: style?.color,
        };
      })()`,
    );
    assert(layout.applicationChromeHidden, `${variant.name} prints app chrome`);
    assert(
      layout.additionalEffects?.includes(
        "+1 to damage while flanking (Synthetic feature).",
      ),
      `${variant.name} omits additional effects`,
    );
    assert(
      layout.cardCount === 24,
      `${variant.name} did not render every card`,
    );
    assert(
      layout.overflowing.length === 0,
      `${variant.name} clips cards: ${layout.overflowing.join(", ")}`,
    );
    assert(
      !layout.weaponFontMismatch,
      `${variant.name} uses smaller weapon text`,
    );
    assert(layout.tableFits, `${variant.name} overflows the multiattack table`);
    assert(
      layout.minimumBodyFont >= (6.5 * 96) / 72 - 0.01,
      `${variant.name} shrinks card bodies below 6.5 pt`,
    );
    assert(
      Math.abs(parseFloat(layout.shortItemFont) - (8 * 96) / 72) < 0.01,
      `${variant.name} unnecessarily shrinks a short item: ${layout.shortItemFont}`,
    );
    assert(
      Math.abs(parseFloat(layout.shortCardFont) - (8 * 96) / 72) < 0.01,
      `${variant.name} unnecessarily shrinks a short card: ${layout.shortCardFont}`,
    );
    assert(
      layout.bandOverflow.length === 0 && layout.targetOverflow.length === 0,
      `${variant.name} clips card bands: ${[...layout.bandOverflow, ...layout.targetOverflow].join(", ")}`,
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
    const evidence = await inspectPdf(
      pdfPath,
      variant.paper,
      true,
      overview.pageCount + overview.cardPages,
    );
    chromiumResults.push({ ...variant, ...layout, ...evidence });
  }

  assert(browserMessages.length === 0, browserMessages.join("\n"));
  const firefoxResults =
    overviewOnly && !process.argv.includes("--firefox-scratchpad")
      ? []
      : await firefoxPrintMatrix(character, origin, scratch);
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
        ...(scratchpadPreview ? { scratchpadPreview } : {}),
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
      await webdriverExecute(
        port,
        sessionId,
        `[...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Print / save PDF").click();`,
      );
      await webdriverWait(
        port,
        sessionId,
        `return document.querySelector(".sheet-page")?.classList.contains("is-print-preview") && document.querySelector(".print-card-body")?.clientHeight > 0 && document.querySelectorAll('.sheet-overview > .ov-paper[aria-label="Character reference"]').length > 0;`,
      );
      if (overviewOnly) {
        // Focused overview diagnostics do not weaken the default physical-card gate.
        const adapter = {
          send: async (method, { expression }) => {
            if (method !== "Runtime.evaluate")
              throw new Error(
                `Unsupported Firefox diagnostic method: ${method}`,
              );
            const value = await webdriverExecuteAsync(
              port,
              sessionId,
              `const done=arguments[arguments.length-1];(async()=>(${expression}))().then(done).catch(error=>done({diagnosticError:String(error)}));`,
            );
            if (value?.diagnosticError) throw new Error(value.diagnosticError);
            return { result: { value } };
          },
        };
        await checkScratchpad(adapter, variant.monochrome);
        results.push({ ...variant, scratchpadGeometry: "pass" });
        continue;
      }
      await webdriverExecute(port, sessionId, installVariantTable);
      const layout = await webdriverExecute(
        port,
        sessionId,
        `const cards = [...document.querySelectorAll(".print-only .print-reference-card")];
         const overflowing = cards.filter((card) =>
           card.scrollHeight > card.clientHeight + 1 ||
           card.scrollWidth > card.clientWidth + 1 ||
           [...card.querySelectorAll(".print-card-body")].some((body) =>
             body.scrollHeight > body.clientHeight + 1 ||
             body.getBoundingClientRect().right > card.getBoundingClientRect().right + 1
           )
         ).map((card) => card.querySelector("h3")?.textContent ?? "unnamed");
         const weaponFontMismatch = [...document.querySelectorAll(".print-card-variant-table")]
           .some((line) => getComputedStyle(line).fontSize !==
             getComputedStyle(line.closest(".print-card-body")).fontSize);
         const tables = [...document.querySelectorAll(".print-card-variant-table")];
         const tableFits = tables.length > 0 && tables.every((table) => table.clientWidth > 0 && [...table.querySelectorAll("th, td")].every((cell) =>
           cell.scrollWidth <= cell.clientWidth + 1));
         const shortCard = cards.find((card) => card.querySelector("h3 > span:last-child")?.textContent === "Synthetic power 02");
         const bandOverflow = [...document.querySelectorAll(".print-card-action-band")]
           .flatMap((band) => [...band.children])
           .filter((cell) =>
             cell.scrollHeight > cell.clientHeight + 1 ||
             cell.scrollWidth > cell.clientWidth + 1
           ).map((cell) => cell.textContent?.trim() ?? "unnamed");
         const targetOverflow = [...document.querySelectorAll(".print-card-combat-band")]
           .flatMap((band) => band.children[1]?.querySelector("dd") ?? [])
           .filter((target) =>
             target.scrollHeight > target.clientHeight + 1 ||
             target.scrollWidth > target.clientWidth + 1
           ).map((target) => target.textContent?.trim() ?? "unnamed");
         const header = document.querySelector(".print-item-card > header");
         const style = header === null ? undefined : getComputedStyle(header);
         return {
           cardCount: cards.length,
           overflowing,
           weaponFontMismatch,
           tableFits,
           shortCardFont: shortCard && getComputedStyle(shortCard.querySelector(".print-card-body")).fontSize,
           shortItemFont: getComputedStyle(cards.find((card) => card.querySelector("h3 > span")?.textContent === "Synthetic item 02").querySelector(".print-card-body")).fontSize,
           minimumBodyFont: Math.min(...cards.map((card) => parseFloat(getComputedStyle(card.querySelector(".print-card-body")).fontSize))),
           bandOverflow,
           targetOverflow,
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
      assert(
        !layout.weaponFontMismatch,
        `Firefox ${variant.name} uses smaller weapon text`,
      );
      assert(
        layout.tableFits,
        `Firefox ${variant.name} overflows the multiattack table`,
      );
      assert(
        layout.minimumBodyFont >= (6.5 * 96) / 72 - 0.01,
        `Firefox ${variant.name} shrinks card bodies below 6.5 pt`,
      );
      assert(
        Math.abs(parseFloat(layout.shortItemFont) - (8 * 96) / 72) < 0.01,
        `Firefox ${variant.name} unnecessarily shrinks a short item: ${layout.shortItemFont}`,
      );
      assert(
        Math.abs(parseFloat(layout.shortCardFont) - (8 * 96) / 72) < 0.01,
        `Firefox ${variant.name} unnecessarily shrinks a short card: ${layout.shortCardFont}`,
      );
      assert(
        layout.bandOverflow.length === 0 && layout.targetOverflow.length === 0,
        `Firefox ${variant.name} clips card bands: ${[...layout.bandOverflow, ...layout.targetOverflow].join(", ")}`,
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
      const expectedPages = await webdriverExecute(
        port,
        sessionId,
        `return [...document.querySelectorAll('.sheet-overview .ov-paper')].filter(p=>!p.closest('.ov-measure')).length + document.querySelectorAll('.print-card-page').length;`,
      );
      const evidence = await inspectPdf(
        path,
        variant.paper,
        false,
        expectedPages,
      );
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
    description:
      index === 0
        ? longText.repeat(7)
        : index % 2 === 0
          ? longText
          : "Move one square, then attack.",
    source: "Synthetic print fixture",
    level: String((index % 30) + 1),
    weapons: [
      {
        name: "Synthetic blade",
        attackBonus: String(8 + (index % 7)),
        damage: `${index % 2 === 0 ? "2d8" : "1d8"}+5`,
        defense: "AC",
        ...(index === 1
          ? { conditions: "+1 to damage while flanking (Synthetic feature)." }
          : {}),
      },
    ],
  }));
  const loot = Array.from({ length: 6 }, (_, index) => ({
    name: `Synthetic item ${String(index + 1).padStart(2, "0")}${index === 5 ? " with a deliberately long category title" : ""}`,
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
    "Healing Surges": "13",
    // Native stat is the additive bonus; 72 HP projects to 18 Surge HP.
    "Healing Surge Value": "0",
    "resist:fire": "5",
    "resist:cold": "-3",
    "Death Saving Throws": "2",
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
          id: "VISION_PRINT_1",
          name: "Low-light",
          type: "Vision",
        },
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

async function checkSummaryPresentation(client, monochrome) {
  const presentation = await evaluate(
    client,
    `(() => {
    const summary = document.querySelector('.ov-paper[aria-label="Character summary"]');
    const tables = [...summary.querySelectorAll('.ov-main-column table, .ov-reminders-column > .ov-flow-pane table')];
    return {
      backgrounds: tables.flatMap(table => {
        const row = table.querySelector('tbody tr');
        return row ? [getComputedStyle(row).backgroundColor] : [];
      }),
      eye:!!summary.querySelector('.ov-senses .lucide-eye'),
      accents: Object.fromEntries([
        ['attack','.sp-basic-attacks > h3'],
        ['defense','.ov-defensive-traits > h3'],
        ['info','.sp-skills-panel > h3'],
        ['abilities','.sp-ability-reference > h3'],
        ['senses','.ov-senses > h3'],
        ['reminders','.ov-reminder-region .sp-panel > h3'],
        ['health','.ov-stat-group[aria-label="Health"] .ov-band-values > div'],
        ['defenseStats','.ov-stat-group[aria-label="Defenses"] .ov-band-values > div'],
        ['initiative','.ov-stat-group[aria-label="Initiative"] .ov-band-values > div'],
        ['speed','.ov-stat-group[aria-label="Speed"] .ov-band-values > div'],
      ].flatMap(([key,selector]) => {
        const element=summary.querySelector(selector);
        return element ? [[key,getComputedStyle(element).backgroundColor]] : [];
      })),
    };
  })()`,
  );
  assert(presentation.eye, "Senses must use the shared eye icon");
  const { accents } = presentation;
  const paragraphs = await evaluate(
    client,
    `(() => {
    const summary=document.querySelector('.ov-paper[aria-label="Character summary"]');
    const sample=document.createElement('div');
    sample.className='sp-reminders';
    sample.innerHTML='<div><strong>Synthetic item</strong><div class="prose-blocks"><p class="prose-paragraph">First property.</p><p class="prose-paragraph">Second property.</p></div></div><div><strong>Separate entry</strong><ul class="ov-reminder-elements"><li><div class="prose-blocks"><p class="prose-paragraph">One benefit.</p><p class="prose-paragraph">Same benefit continued.</p></div></li><li>Another benefit.</li></ul></div>';
    summary.querySelector('.ov-pane-probe').append(sample);
    const blocks=sample.querySelector('.prose-blocks');
    const first=getComputedStyle(blocks.children[0]);
    const second=getComputedStyle(blocks.children[1]);
    const list=sample.querySelector('.ov-reminder-elements');
    const result={gap:parseFloat(getComputedStyle(blocks).rowGap),blockInset:parseFloat(getComputedStyle(blocks).paddingInlineStart),firstIndent:parseFloat(first.textIndent),secondIndent:parseFloat(second.textIndent),paragraphMargin:parseFloat(second.marginTop),entryMargin:parseFloat(getComputedStyle(sample.children[1]).marginTop),listStyle:getComputedStyle(list).listStyleType,listInset:parseFloat(getComputedStyle(list).paddingInlineStart),nestedInset:parseFloat(getComputedStyle(list.querySelector('.prose-blocks')).paddingInlineStart)};
    sample.remove();
    return result;
  })()`,
  );
  assert(
    paragraphs.gap === 0 &&
      paragraphs.paragraphMargin === 0 &&
      paragraphs.firstIndent === 0 &&
      paragraphs.secondIndent === 0 &&
      paragraphs.blockInset > 0 &&
      paragraphs.entryMargin > 0,
    `Reminder descriptions must be inset as a block, reserving spacing for separate entries: ${JSON.stringify(paragraphs)}`,
  );
  assert(
    paragraphs.listStyle === "disc" &&
      paragraphs.listInset > 0 &&
      paragraphs.nestedInset === 0,
    "Distinct benefits must have bullets without double-indenting their paragraphs",
  );
  if (monochrome) {
    assert(
      Object.values(accents).every((color) => {
        const channels = color.match(/\d+/g)?.map(Number);
        return (
          channels?.length === 3 &&
          channels[0] === channels[1] &&
          channels[1] === channels[2]
        );
      }),
      `Monochrome summary accents must be grayscale: ${JSON.stringify(accents)}`,
    );
  } else {
    assert(
      [
        accents.attack,
        accents.defense,
        accents.info,
        accents.abilities,
        accents.senses,
        ...(accents.reminders ? [accents.reminders] : []),
      ].every((color) => color === "rgb(234, 240, 246)"),
      `All summary panes must share the slate-blue tint: ${JSON.stringify(accents)}`,
    );
    assert(
      accents.defenseStats === "rgb(238, 243, 233)" &&
        accents.health === "rgb(240, 236, 245)" &&
        accents.initiative === "rgb(234, 242, 240)" &&
        accents.speed === accents.initiative,
      `Numeric groups must use green defenses, violet health and teal initiative/speed: ${JSON.stringify(accents)}`,
    );
  }
  assert(
    presentation.backgrounds.length > 0 &&
      presentation.backgrounds.every((color) => color === "rgb(240, 243, 245)"),
    `Summary tables must consistently shade their first row: ${JSON.stringify(presentation.backgrounds)}`,
  );
  const original = await evaluate(
    client,
    `(() => {
    const name = document.querySelector('.ov-character-name');
    const parent = name.parentElement;
    const saved = {text:name.textContent,maxWidth:parent.style.maxWidth,fontSize:parseFloat(getComputedStyle(name).fontSize)};
    name.textContent = 'A very long synthetic character name '.repeat(20);
    parent.style.maxWidth = (parent.getBoundingClientRect().width-1)+'px';
    return saved;
  })()`,
  );
  try {
    await waitForExpression(
      client,
      `parseFloat(getComputedStyle(document.querySelector('.ov-character-name')).fontSize) <= 24.01`,
    );
    const longName = await evaluate(
      client,
      `(() => {
      const name = document.querySelector('.ov-character-name');
      const style = getComputedStyle(name);
      return {fontSize:parseFloat(style.fontSize),ellipsis:style.textOverflow,nowrap:style.whiteSpace,overflowing:name.scrollWidth>name.clientWidth};
    })()`,
    );
    assert(
      Math.abs(longName.fontSize - 24) < 0.1,
      "Long names must stop shrinking at 18pt",
    );
    assert(
      longName.ellipsis === "ellipsis" &&
        longName.nowrap === "nowrap" &&
        longName.overflowing,
      "Names beyond the minimum must truncate on one line",
    );
  } finally {
    await evaluate(
      client,
      `(() => {
      const name = document.querySelector('.ov-character-name');
      name.textContent = ${JSON.stringify(original.text)};
      name.parentElement.style.maxWidth = ${JSON.stringify(original.maxWidth)};
    })()`,
    );
  }
  await waitForExpression(
    client,
    `Math.abs(parseFloat(getComputedStyle(document.querySelector('.ov-character-name')).fontSize) - ${original.fontSize}) < 0.4`,
  );
}

async function checkScratchpad(client, monochrome) {
  const state = await evaluate(
    client,
    `(() => {
    const page=document.querySelector('.sheet-overview > .ov-paper[aria-label="Play scratchpad"]');
    const expected=[...document.querySelectorAll('.ov-measure .ov-power-trackers [data-tracking-id]')].map(e=>e.dataset.trackingId);
    const pages=[...document.querySelectorAll('.sheet-overview > .ov-paper')].filter(p=>['Play scratchpad','Power usage · continued'].includes(p.getAttribute('aria-label')));
    const actual=pages.flatMap(p=>[...p.querySelectorAll('[data-tracking-id]')].map(e=>e.dataset.trackingId));
    const segments=[...page.querySelectorAll('.ov-surge-segment')];
    return {expected:[...new Set(expected)].sort(), actual:actual.sort(),
      segments:segments.length, tracks:page.querySelectorAll('.ov-surge-row').length,
      surgeGaps:segments.some(e=>parseFloat(getComputedStyle(e).marginLeft)>0),
      powerPanes:[...page.querySelectorAll('.ov-tracking-panels > .sp-panel')].map(e=>({left:e.getBoundingClientRect().left,top:e.getBoundingClientRect().top,width:e.getBoundingClientRect().width})),
      segmentWidth:Math.min(...segments.map(e=>e.getBoundingClientRect().width)),
      labels:[...page.querySelectorAll('.ov-surge-label')].map(e=>e.textContent),
      writingHeight:page.querySelector('.sp-hp-writing > div').getBoundingClientRect().height,
      effectsRows:page.querySelectorAll('.ov-effects-table tbody tr').length,
      effectHeight:page.querySelector('.ov-effects-table tbody tr').getBoundingClientRect().height,
      obsolete:page.textContent.includes('Quick reference')||page.textContent.includes('Reminders'),
      header:getComputedStyle(page.querySelector('.ov-scratch-health > h3')).backgroundColor,
      health:getComputedStyle(page.querySelector('.ov-scratch-health-values > div')).backgroundColor,
      healthCells:page.querySelectorAll('.ov-scratch-health-values > div').length,
      deathSaveGap:page.querySelector('.sp-death-saves > span').getBoundingClientRect().left-page.querySelector('.sp-death-saves').getBoundingClientRect().left,
      deathSaveAlignment:getComputedStyle(page.querySelector('.sp-death-saves')).justifyContent,
      surgeHP:page.querySelector('.ov-scratch-health-values > div:last-child strong').textContent,
    };
  })()`,
  );
  assert(
    JSON.stringify(state.actual) === JSON.stringify(state.expected),
    `Every tracking group must occur exactly once across adjacent pages: ${JSON.stringify(state)}`,
  );
  assert(
    state.segments === 13 && state.tracks === 1 && state.segmentWidth >= 14,
    `13 surges must fit one markable segmented bar: ${JSON.stringify(state)}`,
  );
  assert(
    state.healthCells === 4 &&
      state.deathSaveAlignment === "flex-start" &&
      state.deathSaveGap < 120,
    `Scratchpad health needs four compact reference cells and skulls beside the death-save label: ${JSON.stringify(state)}`,
  );
  assert(
    !state.surgeGaps &&
      state.powerPanes.length === 2 &&
      Math.abs(state.powerPanes[0].top - state.powerPanes[1].top) < 1 &&
      state.powerPanes[0].width > state.powerPanes[1].width &&
      state.powerPanes[1].left > state.powerPanes[0].left,
    `Power panes must share a row with a narrower Daily pane, and surge bars have no grouping gaps: ${JSON.stringify(state)}`,
  );
  assert(
    JSON.stringify(state.labels) === JSON.stringify(["13", "10", "5", "0"]),
    "Longer surge bars need sparse remaining-count labels and both endpoints",
  );
  assert(
    state.writingHeight >= 66 &&
      state.effectsRows === 6 &&
      state.effectHeight >= 39 &&
      !state.obsolete,
    "Scratchpad must reserve handwriting space and omit redundant reference panes",
  );
  assert(
    state.surgeHP === "18",
    "Scratchpad must use the projected surge total, not the raw additive stat",
  );
  assert(
    state.header ===
      (monochrome ? "rgb(238, 238, 238)" : "rgb(234, 240, 246)") &&
      state.health ===
        (monochrome ? "rgb(238, 238, 238)" : "rgb(240, 236, 245)"),
    `Scratchpad must match the approved slate header/violet health palette: ${JSON.stringify(state)}`,
  );
  const baseline = await evaluate(
    client,
    `(() => {
    const p=document.querySelector('.sheet-overview > .ov-paper[aria-label="Play scratchpad"]');
    return {count:p.querySelectorAll('[data-tracking-id]').length,health:p.querySelector('.ov-scratch-health').getBoundingClientRect().top,records:p.querySelector('.ov-scratch-records').getBoundingClientRect().height};
  })()`,
  );
  const rule = await evaluate(
    client,
    `(() => {
    const s=document.styleSheets[0], i=s.cssRules.length;
    s.insertRule('.sheet-overview .ov-power-trackers .sp-usage-table tbody > tr { height: 160px; }',i);
    s.insertRule('.sheet-overview .ov-power-trackers .sp-daily-list > div { min-height: 160px; }',i+1);
    return i;
  })()`,
  );
  try {
    await waitForExpression(
      client,
      `document.querySelector('.sheet-overview > .ov-paper[aria-label="Play scratchpad"]').querySelectorAll('[data-tracking-id]').length < ${baseline.count}`,
    );
    await evaluate(
      client,
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))",
      true,
    );
    const stress = await evaluate(
      client,
      `(() => {
      const pages=[...document.querySelectorAll('.sheet-overview > .ov-paper')].filter(p=>['Play scratchpad','Power usage · continued'].includes(p.getAttribute('aria-label')));
      const p=pages[0];
      return {ids:pages.flatMap(p=>[...p.querySelectorAll('[data-tracking-id]')].map(e=>e.dataset.trackingId)).sort(),overflow:pages.some(p=>p.querySelector('.sp-page-content').getBoundingClientRect().bottom>p.querySelector('.sp-page-footer').getBoundingClientRect().top-7),geometry:pages.map(p=>({title:p.getAttribute('aria-label'),bottom:p.querySelector('.sp-page-content').getBoundingClientRect().bottom,footer:p.querySelector('.sp-page-footer').getBoundingClientRect().top,rows:p.querySelectorAll('[data-tracking-id]').length})),health:p.querySelector('.ov-scratch-health').getBoundingClientRect().top,records:p.querySelector('.ov-scratch-records').getBoundingClientRect().height};
    })()`,
    );
    assert(
      JSON.stringify(stress.ids) === JSON.stringify(state.expected) &&
        !stress.overflow,
      `Dense tracking must preserve every row on adjacent measured pages: ${JSON.stringify(stress)}`,
    );
    assert(
      stress.health === baseline.health && stress.records === baseline.records,
      "Power growth must not displace health or consume handwriting areas",
    );
  } finally {
    await evaluate(
      client,
      `(() => { document.styleSheets[0].deleteRule(${rule + 1}); document.styleSheets[0].deleteRule(${rule}); return true; })()`,
    );
  }
  await waitForExpression(
    client,
    `document.querySelector('.sheet-overview > .ov-paper[aria-label="Play scratchpad"]').querySelectorAll('[data-tracking-id]').length === ${baseline.count}`,
  );
}

async function checkSummaryContinuation(client) {
  const reminderCount = await evaluate(
    client,
    `document.querySelectorAll('.ov-reminder-probe [data-reminder-index]').length`,
  );
  assert(reminderCount > 0, "Continuation fixture needs summary reminders");
  const ruleIndex = await evaluate(
    client,
    `(() => {
    const sheet = document.styleSheets[0];
    return sheet.insertRule('.ov-reminder-probe [data-reminder-index] { min-height: 2000px; }', sheet.cssRules.length);
  })()`,
  );
  try {
    await waitForExpression(
      client,
      `document.querySelectorAll('.sheet-overview > .ov-paper[aria-label="Character summary · continued"]').length > 0 && document.querySelector('.ov-reminder-region .sp-caption')?.textContent.includes('page 2')`,
    );
    const continuation = await evaluate(
      client,
      `(() => {
      const pages=[...document.querySelectorAll('.sheet-overview > .ov-paper')];
      const summary=pages[0], next=pages[1], scratch=pages.find(p=>p.getAttribute('aria-label')==='Play scratchpad');
      const labels=[...summary.querySelectorAll('.ov-reminder-probe [data-reminder-index] > strong')].map(e=>e.textContent.trim());
      return {second:next?.getAttribute('aria-label'),page:next?.querySelector('.sp-page-footer').textContent,allPresent:labels.every(label=>next?.textContent.includes(label)),scratchPage:scratch?.querySelector('.sp-page-footer').textContent,overflow:next?.dataset.overviewOverflow};
    })()`,
    );
    assert(
      continuation.second === "Character summary · continued" &&
        continuation.page.endsWith(" · 2"),
      `Reminders must continue directly on page 2: ${JSON.stringify(continuation)}`,
    );
    assert(
      continuation.allPresent && continuation.overflow === "false",
      `Continuation must retain reminders and fit: ${JSON.stringify(continuation)}`,
    );
    assert(
      continuation.scratchPage.endsWith(" · 3"),
      "Scratchpad must follow the summary continuation",
    );
  } catch (error) {
    const state = await evaluate(
      client,
      `({pages:[...document.querySelectorAll('.sheet-overview > .ov-paper')].map(p=>p.getAttribute('aria-label')),caption:document.querySelector('.ov-reminder-region .sp-caption')?.textContent,entries:[...document.querySelectorAll('.ov-reminder-probe [data-reminder-index]')].map(e=>e.getBoundingClientRect().height),probes:[...document.querySelectorAll('.ov-measure')].map(e=>({height:e.getBoundingClientRect().height,text:e.textContent.slice(0,250)}))})`,
    );
    throw new Error(`${error.message}: ${JSON.stringify(state)}`);
  } finally {
    await evaluate(client, `document.styleSheets[0].deleteRule(${ruleIndex})`);
  }
  await waitForExpression(
    client,
    `!document.querySelector('.sheet-overview > .ov-paper[aria-label="Character summary · continued"]') && document.querySelector('.sheet-overview > .ov-paper[aria-label="Play scratchpad"] .sp-page-footer').textContent.endsWith(' · 2')`,
  );
}

async function checkSummaryPaneFlow(client) {
  const baseline = await evaluate(
    client,
    `(() => {
    const summary = document.querySelector('.ov-paper[aria-label="Character summary"]');
    const left = summary.querySelector('.ov-main-column');
    const right = summary.querySelector('.ov-reminders-column');
    const ids = (column) => [...column.querySelectorAll(':scope > .ov-flow-pane')].map(p=>p.dataset.summaryPane);
    return {left:ids(left),right:ids(right),sensesOnLeft:!!left.querySelector('[data-summary-pane="senses"] .ov-senses'),defensesOnRight:!!right.querySelector(':scope > .ov-defensive-traits')};
  })()`,
  );
  assert(
    baseline.sensesOnLeft,
    "Summary senses must precede skills on the left",
  );
  assert(
    baseline.defensesOnRight,
    "Defensive traits must remain above reminders on the right",
  );
  assert(
    JSON.stringify([...baseline.left, ...baseline.right]) ===
      JSON.stringify(["senses", "skills", "abilities", "attacks"]),
    `Summary panes must retain priority order without duplicates: ${JSON.stringify(baseline)}`,
  );
  // Defensive-trait growth must consume reminder space, not displace left panes.
  const defenseRule = await evaluate(
    client,
    `(() => {
    const pane=document.querySelector('.ov-reminders-column > .ov-defensive-traits');
    const sheet=document.styleSheets[0];
    return sheet.insertRule('.ov-reminders-column > .ov-defensive-traits { min-height: '+(pane.getBoundingClientRect().height+80)+'px; }', sheet.cssRules.length);
  })()`,
  );
  try {
    await evaluate(
      client,
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))",
      true,
    );
    const left = await evaluate(
      client,
      `[...document.querySelectorAll('.ov-main-column > .ov-flow-pane')].map(p=>p.dataset.summaryPane)`,
    );
    assert(
      JSON.stringify(left) === JSON.stringify(baseline.left),
      "Defensive traits must not displace skills or abilities",
    );
  } finally {
    await evaluate(
      client,
      `document.styleSheets[0].deleteRule(${defenseRule})`,
    );
  }
  // Increase the last whole pane's height to force a real measured overflow.
  // CSSOM avoids inline-style CSP exemptions and applies after React moves it.
  const ruleIndex = await evaluate(
    client,
    `(() => {
    const summary = document.querySelector('.ov-paper[aria-label="Character summary"]');
    const left = summary.querySelector('.ov-main-column');
    const panes = [...summary.querySelectorAll('.ov-pane-probe > .ov-flow-pane')];
    const gap = parseFloat(getComputedStyle(left).rowGap) || 0;
    const available = summary.querySelector('.sp-page-footer').getBoundingClientRect().top - 8 - left.getBoundingClientRect().top;
    const prefix = panes.slice(0,-1).reduce((sum,p)=>sum+p.getBoundingClientRect().height+gap,0);
    const height = Math.max(panes.at(-1).getBoundingClientRect().height, available-prefix+24);
    const sheet = document.styleSheets[0];
    return sheet.insertRule('.ov-paper[aria-label="Character summary"] .ov-flow-pane[data-summary-pane="attacks"] { min-height: '+height+'px; }', sheet.cssRules.length);
  })()`,
  );
  try {
    await waitForExpression(
      client,
      `!!document.querySelector('.ov-reminders-column > [data-summary-pane="attacks"]')`,
    );
    const stress = await evaluate(
      client,
      `(() => {
      const summary = document.querySelector('.ov-paper[aria-label="Character summary"]');
      const moved = summary.querySelector('.ov-reminders-column > [data-summary-pane="attacks"]');
      const reminders = summary.querySelector('.ov-reminder-region');
      const footer = summary.querySelector('.sp-page-footer');
      return {beforeReminders:!!(moved.compareDocumentPosition(reminders) & Node.DOCUMENT_POSITION_FOLLOWING),bottom:moved.getBoundingClientRect().bottom,footer:footer.getBoundingClientRect().top};
    })()`,
    );
    assert(stress.beforeReminders, "Overflow panes must precede reminders");
    assert(
      stress.bottom <= stress.footer - 7,
      "Moved pane must fit above the footer",
    );
  } finally {
    await evaluate(client, `document.styleSheets[0].deleteRule(${ruleIndex})`);
  }
  await waitForExpression(
    client,
    `(() => {
    const left = document.querySelector('.ov-main-column');
    return JSON.stringify([...left.querySelectorAll(':scope > .ov-flow-pane')].map(p=>p.dataset.summaryPane)) === ${JSON.stringify(JSON.stringify(baseline.left))};
  })()`,
  );
  await evaluate(
    client,
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
    true,
  );
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

async function inspectPdf(
  path,
  paper,
  requireTagged = true,
  expectedPages,
  onlyOverview = false,
) {
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
    pages === expectedPages,
    `${path} should contain ${expectedPages} measured overview/card pages, got ${pages}: ${text
      .split("\f")
      .map((page, index) => `${index + 1}: ${page.trim().slice(0, 100)}`)
      .join(" | ")}`,
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
  if (onlyOverview)
    assert(
      normalizedText.includes("end of preserved overview notes."),
      `${path} loses continued overview notes`,
    );
  const compactText = text.replace(/\s+/g, " ");
  for (const required of [
    "Synthetic print fixture hero",
    "Character reference",
    "Synthetic resilience",
    "Synthetic focus",
    "Resistances & Weaknesses",
    "Fire 5",
    "Cold 3",
    ...(onlyOverview
      ? []
      : [
          "Synthetic power 01",
          "Synthetic power 18",
          "Synthetic item 01",
          "Synthetic item 06",
        ]),
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
    !/(?:Hit Points|Maximum HP)\s+72/i.test(compactText),
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

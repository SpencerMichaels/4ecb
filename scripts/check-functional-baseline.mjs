import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { cpus, freemem, platform, release, tmpdir, totalmem } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { format } from "prettier";

class CdpClient {
  #id = 0;
  #pending = new Map();
  #listeners = new Map();
  #socket;

  constructor(url) {
    this.#socket = new WebSocket(url);
    this.ready = new Promise((resolveReady, reject) => {
      this.#socket.addEventListener("open", resolveReady, { once: true });
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
    return new Promise((resolveResult, reject) => {
      this.#pending.set(id, { resolve: resolveResult, reject });
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

const projectRoot = process.cwd();
const requestedOutput = process.argv.find((argument) =>
  argument.startsWith("--output="),
);
const requestedRuns = process.argv.find((argument) =>
  argument.startsWith("--runs="),
);
const runCount = Number(requestedRuns?.split("=", 2)[1] ?? "3");
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 10)
  throw new Error("--runs must be an integer from 1 through 10");
const outputDirectory = resolve(
  projectRoot,
  requestedOutput?.split("=", 2)[1] ?? "tmp/functional-baseline",
);
await mkdir(outputDirectory, { recursive: true });

const scratch = await mkdtemp(join(tmpdir(), "4ecb-functional-baseline-"));
const browserProfile = join(scratch, "chromium-profile");
const previewPort = await availablePort();
const debugPort = await availablePort();
const fixtureProcess = spawn(
  "pnpm",
  ["exec", "tsx", "scripts/print-functional-baseline-fixture.ts"],
  { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
);
const fixture = JSON.parse(await collectProcess(fixtureProcess));
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
  await client.send("Network.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: instrumentationSource(),
  });
  const browserMessages = [];
  client.on("Log.entryAdded", ({ entry }) => {
    if (["error", "warning"].includes(entry?.level))
      browserMessages.push(entry.text);
  });
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    browserMessages.push(
      exceptionDetails?.exception?.description ??
        exceptionDetails?.text ??
        "Unidentified browser exception",
    );
  });

  const origin = `http://127.0.0.1:${previewPort}`;
  await navigate(client, `${origin}/#/settings`);
  await waitForExpression(client, `document.querySelector(".settings-page")`);
  await seedDatabase(client, fixture);

  const runs = [];
  for (let index = 0; index < runCount; index += 1) {
    runs.push(
      await runScenario(client, origin, fixture, outputDirectory, index),
    );
  }
  const bundle = await bundleMetrics(join(projectRoot, "apps/web/dist"));
  assert(
    bundle.initialRouteJavascript.gzipBytes <= 120 * 1024,
    `Initial route JavaScript is ${bundle.initialRouteJavascript.gzipBytes} gzip bytes; expected at most ${120 * 1024}`,
  );
  for (const route of [
    "CharacterEditorPage",
    "CharacterSheetPage",
    "SettingsPage",
  ])
    assert(
      bundle.routeJavascript[route] !== undefined,
      `${route} was not emitted as an independent production chunk`,
    );
  await client.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await navigate(
    client,
    `${origin}/?offline-route=1#/characters/${fixture.character.id}`,
  );
  await waitForExpression(client, `document.querySelector(".sheet-page")`);
  const offlineDirectSheet = "pass";
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const routeErrorMessageStart = browserMessages.length;
  const sheetChunk = bundle.routeJavascript.CharacterSheetPage.file;
  await client.send("Network.setBypassServiceWorker", { bypass: true });
  await client.send("Network.setBlockedURLs", { urls: [`*${sheetChunk}`] });
  await navigate(
    client,
    `${origin}/?route-error=1#/characters/${fixture.character.id}`,
  );
  await waitForExpression(client, `document.querySelector(".fatal-error")`);
  const routeErrorMessage = await evaluate(
    client,
    `document.querySelector(".fatal-error")?.textContent`,
  );
  await screenshot(client, join(outputDirectory, "route-error.png"));
  const routeErrorBrowserMessages = browserMessages.splice(
    routeErrorMessageStart,
    browserMessages.length - routeErrorMessageStart,
  );
  assert(
    routeErrorMessage?.includes("The application could not continue"),
    "Blocked route chunk did not reach the application error boundary",
  );
  await client.send("Network.setBlockedURLs", { urls: [] });
  await client.send("Network.setBypassServiceWorker", { bypass: false });
  const chromiumVersion = await browserVersion(debugPort);
  const metrics = summarizeRuns(runs);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixture: fixture.counts,
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtReport: freemem(),
      chromium: chromiumVersion,
      viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
      buildMode: "Vite production preview",
    },
    protocol: {
      runs: runCount,
      aggregation: "median, minimum, maximum, sample standard deviation",
      timingAssertions:
        "Recorded as evidence; ordinary CI asserts behavior and instrumentation shape, not host timing.",
      indexedDbBytes:
        "Approximate structured-clone payload bytes: JSON UTF-8 plus ArrayBuffer/view byte lengths.",
      queryToPaint:
        "Input event start through two requestAnimationFrame callbacks and the resulting DOM read.",
      longTasks:
        "PerformanceObserver longtask entries attributed between the interaction start and second animation frame.",
    },
    bundle,
    runs,
    summary: metrics,
    guardrails: {
      initialRouteJavascriptAtMost120KiBGzip: {
        limit: 120 * 1024,
        observed: bundle.initialRouteJavascript.gzipBytes,
        pass: bundle.initialRouteJavascript.gzipBytes <= 120 * 1024,
      },
      candidateMountedRowsAtMost200: {
        limit: 200,
        observed: metrics.candidateMountedRows.maximum,
        pass: metrics.candidateMountedRows.maximum <= 200,
      },
      shopMountedRowsAtMost200: {
        limit: 200,
        observed: metrics.shopMountedRows.maximum,
        pass: metrics.shopMountedRows.maximum <= 200,
      },
      interactionLongTaskAtMost50Milliseconds: {
        limit: 50,
        observed: metrics.maximumInteractionLongTask.maximum,
        pass: metrics.maximumInteractionLongTask.maximum <= 50,
      },
      cachedEvaluationVisibleWithin100Milliseconds: {
        limit: 100,
        observed: metrics.warmReopenMilliseconds.maximum,
        pass: metrics.warmReopenMilliseconds.maximum <= 100,
      },
      warmTabsDoNotCreateWorkers: {
        observedAdditionalWorkers: metrics.warmTabAdditionalWorkers.maximum,
        pass: metrics.warmTabAdditionalWorkers.maximum === 0,
      },
    },
    browserMessages,
    routeErrorMessage,
    routeErrorBrowserMessages,
    offlineDirectSheet,
  };
  await writeFile(
    join(outputDirectory, "functional-baseline.json"),
    await format(JSON.stringify(report), { parser: "json" }),
  );
  console.log(JSON.stringify(report, null, 2));
  assert(browserMessages.length === 0, browserMessages.join("\n"));
} finally {
  client?.close();
  chromium.kill("SIGTERM");
  preview.kill("SIGTERM");
  await Promise.allSettled([processExit(chromium), processExit(preview)]);
  await rm(scratch, { recursive: true, force: true });
}

async function runScenario(client, origin, fixture, outputDirectory, runIndex) {
  const id = fixture.character.id;
  await navigate(client, `${origin}/?baseline=${runIndex}#/characters`);
  await waitForExpression(
    client,
    `document.body.textContent.includes("Baseline Hero")`,
  );
  const coldLibrary = await snapshotInstrumentation(client);

  const editorUrl = `${origin}/?baseline-editor=${runIndex}#/characters/${id}/edit?tab=build&level=1`;
  const directStarted = performance.now();
  await navigate(client, editorUrl);
  await waitForExpression(
    client,
    `document.querySelector(".builder-character-name") && performance.getEntriesByName("4ecb:character-first-evaluation").length > 0`,
  );
  const directEditorMilliseconds = performance.now() - directStarted;
  const directEditor = await snapshotInstrumentation(client);
  await setHash(
    client,
    `#/characters/${id}/edit?tab=build&level=1&section=feats`,
  );
  await waitForExpression(
    client,
    `document.querySelector(".candidate-selection-table")`,
  );

  const candidateSearches = [];
  for (const term of ["Baseline Feat", "Baseline Feat 0", "Baseline Feat"]) {
    candidateSearches.push(
      await measuredInput(
        client,
        `.candidate-selection-table input[type="search"]`,
        term,
        `.candidate-selection-table tbody tr:not(.selection-type-row)`,
      ),
    );
  }
  const candidateMountedRows = await evaluate(
    client,
    `document.querySelectorAll(".candidate-selection-table tbody tr:not(.selection-type-row)").length`,
  );
  if (runIndex === 0) {
    await screenshot(client, join(outputDirectory, "candidate-table.png"));
    await checkCandidatePaging(client, outputDirectory);
  }

  await setHash(client, `#/characters`);
  await waitForExpression(
    client,
    `document.body.textContent.includes("Baseline Hero") && !document.querySelector(".editor-page")`,
  );
  await evaluate(client, `performance.clearMeasures()`);
  const warmStarted = performance.now();
  await setHash(
    client,
    `#/characters/${id}/edit?tab=build&level=1&section=feats`,
  );
  await waitForExpression(
    client,
    `performance.getEntriesByName("4ecb:character-first-evaluation").length > 0`,
  );
  const warmReopenMilliseconds = performance.now() - warmStarted;

  const workersBeforeTabs = await evaluate(
    client,
    `globalThis.__4ecbBaseline.workers.length`,
  );
  await setHash(client, `#/characters/${id}/edit?tab=overview`);
  await waitForExpression(
    client,
    `document.querySelector('.builder-tabs [role="tab"][aria-selected="true"]')?.textContent.includes("Overview") && document.querySelector(".build-overview")`,
  );
  await setHash(client, `#/characters/${id}/edit?tab=equipment`);
  await waitForExpression(
    client,
    `document.querySelector('.builder-tabs [role="tab"][aria-selected="true"]')?.textContent.includes("Equipment") && document.querySelector(".inventory-table")`,
  );
  if (runIndex === 0) {
    await screenshot(client, join(outputDirectory, "inventory.png"));
    await click(client, `button[aria-controls="wallet-dialog"]`);
    await waitForExpression(
      client,
      `document.querySelector("#wallet-dialog")?.open`,
    );
    await screenshot(client, join(outputDirectory, "funds-dialog.png"));
    await evaluate(client, `document.querySelector("#wallet-dialog")?.close()`);
  }
  await setHash(
    client,
    `#/characters/${id}/edit?tab=shop&category=adventuring-gear`,
  );
  await waitForExpression(
    client,
    `document.querySelector('.builder-tabs [role="tab"][aria-selected="true"]')?.textContent.includes("Shop") && document.querySelectorAll(".shop-table tbody tr:not(.shop-category-row)").length > 0`,
  );
  const workersAfterTabs = await evaluate(
    client,
    `globalThis.__4ecbBaseline.workers.length`,
  );
  const shopMountedRows = await evaluate(
    client,
    `document.querySelectorAll(".shop-table tbody tr:not(.shop-category-row)").length`,
  );
  const shopSearches = [];
  for (const term of ["Baseline Gear", "Baseline Gear 00", "Baseline Gear"]) {
    shopSearches.push(
      await measuredInput(
        client,
        `.shop-search input[type="search"]`,
        term,
        `.shop-table tbody tr:not(.shop-category-row)`,
      ),
    );
  }
  if (runIndex === 0)
    await screenshot(client, join(outputDirectory, "shop.png"));

  await setHash(client, `#/characters/${id}/edit?tab=overview`);
  await waitForExpression(
    client,
    `location.hash.includes("tab=overview") && document.querySelector('.builder-tabs [role="tab"][aria-selected="true"]')?.textContent.includes("Overview")`,
  );
  await setHash(client, `#/characters/${id}/edit?tab=equipment`);
  await waitForExpression(
    client,
    `location.hash.includes("tab=equipment") && document.querySelector('.builder-tabs [role="tab"][aria-selected="true"]')?.textContent.includes("Equipment")`,
  );
  await evaluate(client, `history.back()`);
  await waitForExpression(
    client,
    `location.hash.includes("tab=overview") && document.querySelector('.builder-tabs [role="tab"][aria-selected="true"]')?.textContent.includes("Overview")`,
  );
  await evaluate(client, `history.forward()`);
  await waitForExpression(
    client,
    `location.hash.includes("tab=equipment") && document.querySelector('.builder-tabs [role="tab"][aria-selected="true"]')?.textContent.includes("Equipment")`,
  );

  if (runIndex === 0) {
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 750,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
  await setHash(client, `#/characters/${id}`);
  if (runIndex === 0) {
    await waitForExpression(
      client,
      `document.querySelector(".route-loading-state[aria-busy=true]")`,
    );
    await screenshot(client, join(outputDirectory, "route-loading.png"));
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
  await waitForExpression(client, `document.querySelector(".sheet-page")`);
  await waitForExpression(
    client,
    `document.activeElement?.id === "main-content"`,
  );
  if (runIndex === 0) {
    await screenshot(client, join(outputDirectory, "sheet-view.png"));
    await client.send("Emulation.setEmulatedMedia", { media: "print" });
    await screenshot(client, join(outputDirectory, "print-preview.png"));
    await client.send("Emulation.setEmulatedMedia", { media: "screen" });
  }

  await setHash(
    client,
    `#/characters/${id}/edit?tab=build&level=1&section=feats`,
  );
  await waitForExpression(
    client,
    `document.querySelector(".builder-character-name input")`,
  );
  const renamed = `Baseline Hero Run ${runIndex + 1}`;
  await measuredInput(
    client,
    `.builder-character-name input`,
    renamed,
    `.builder-character-name input`,
  );
  await evaluate(
    client,
    `document.querySelector(".builder-character-name input")?.blur()`,
  );
  await waitForExpression(
    client,
    `document.querySelector('button[aria-label="Undo"]')?.disabled === false && document.querySelector('.save-status')?.getAttribute('title') === "Saved locally"`,
  );
  await click(client, `button[aria-label="Undo"]`);
  await waitForExpression(
    client,
    `document.querySelector(".builder-character-name input")?.value !== ${JSON.stringify(renamed)}`,
  );
  await click(client, `button[aria-label="Redo"]`);
  await waitForExpression(
    client,
    `document.querySelector(".builder-character-name input")?.value === ${JSON.stringify(renamed)}`,
  );

  const finalInstrumentation = await snapshotInstrumentation(client);
  const interactionLongTasks = [...candidateSearches, ...shopSearches].flatMap(
    ({ longTasks }) => longTasks,
  );
  return {
    run: runIndex + 1,
    coldLibrary,
    directEditorMilliseconds,
    directEditor,
    warmReopenMilliseconds,
    candidateSearches,
    candidateMountedRows,
    shopSearches,
    shopMountedRows,
    warmTabAdditionalWorkers: workersAfterTabs - workersBeforeTabs,
    maximumInteractionLongTask: Math.max(
      0,
      ...interactionLongTasks.map(({ duration }) => duration),
    ),
    journey: ["build", "overview", "equipment", "shop", "sheet"],
    saveUndoRedo: "pass",
    browserBackForward: "pass",
    finalInstrumentation,
  };
}

async function measuredInput(client, selector, value, countSelector) {
  return evaluate(
    client,
    `(async () => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement)) throw new Error("Input not found");
      const startedAt = performance.now();
      const longTaskIndex = globalThis.__4ecbBaseline.longTasks.length;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        value: ${JSON.stringify(value)},
        milliseconds: performance.now() - startedAt,
        mountedRows: document.querySelectorAll(${JSON.stringify(countSelector)}).length,
        longTasks: globalThis.__4ecbBaseline.longTasks.slice(longTaskIndex),
      };
    })()`,
    true,
  );
}

async function snapshotInstrumentation(client) {
  return evaluate(
    client,
    `({
      workers: [...globalThis.__4ecbBaseline.workers],
      indexedDb: structuredClone(globalThis.__4ecbBaseline.indexedDb),
      longTasks: [...globalThis.__4ecbBaseline.longTasks],
      measures: performance.getEntriesByType("measure")
        .filter((entry) => entry.name.startsWith("4ecb:"))
        .map((entry) => ({ name: entry.name, duration: entry.duration, detail: entry.detail })),
      navigation: performance.getEntriesByType("navigation").map((entry) => ({
        duration: entry.duration,
        domContentLoaded: entry.domContentLoadedEventEnd,
        loadEvent: entry.loadEventEnd,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      })),
      javascriptResources: performance.getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
        .map((entry) => ({
          file: new URL(entry.name).pathname,
          startTime: entry.startTime,
          duration: entry.duration,
          transferSize: entry.transferSize,
          decodedBodySize: entry.decodedBodySize,
        })),
    })`,
  );
}

function instrumentationSource() {
  return `(() => {
    const state = globalThis.__4ecbBaseline = {
      workers: [],
      longTasks: [],
      indexedDb: { calls: 0, records: 0, bytes: 0, byStore: {} },
    };
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class InstrumentedWorker extends NativeWorker {
      constructor(url, options) {
        state.workers.push(String(url));
        super(url, options);
      }
    };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {}
    const byteSize = (value, seen = new WeakSet()) => {
      if (value === undefined || value === null) return 0;
      if (value instanceof ArrayBuffer) return value.byteLength;
      if (ArrayBuffer.isView(value)) return value.byteLength;
      if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
      if (typeof value !== "object") return 8;
      if (seen.has(value)) return 0;
      seen.add(value);
      if (Array.isArray(value)) return value.reduce((sum, item) => sum + byteSize(item, seen), 0);
      return Object.entries(value).reduce((sum, [key, item]) =>
        sum + new TextEncoder().encode(key).byteLength + byteSize(item, seen), 0);
    };
    const record = (store, value) => {
      const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
      const bytes = values.reduce((sum, item) => sum + byteSize(item), 0);
      state.indexedDb.records += values.length;
      state.indexedDb.bytes += bytes;
      const current = state.indexedDb.byStore[store] ?? { calls: 0, records: 0, bytes: 0 };
      current.records += values.length;
      current.bytes += bytes;
      state.indexedDb.byStore[store] = current;
    };
    const patch = (prototype, method, storeFor) => {
      const native = prototype?.[method];
      if (typeof native !== "function") return;
      prototype[method] = function(...args) {
        const store = storeFor(this);
        state.indexedDb.calls += 1;
        const current = state.indexedDb.byStore[store] ?? { calls: 0, records: 0, bytes: 0 };
        current.calls += 1;
        state.indexedDb.byStore[store] = current;
        const request = native.apply(this, args);
        request.addEventListener("success", () => record(store, request.result), { once: true });
        return request;
      };
    };
    for (const method of ["get", "getAll", "getAllKeys"])
      patch(IDBObjectStore.prototype, method, (store) => store.name);
    for (const method of ["get", "getAll", "getAllKeys"])
      patch(IDBIndex.prototype, method, (index) => index.objectStore.name);
  })();`;
}

async function seedDatabase(client, fixture) {
  await evaluate(
    client,
    `(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("4ecb");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const encoded = new TextEncoder().encode(${JSON.stringify(fixture.encodedPack)}).buffer;
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(["contentPacks", "contentPackMetadata", "settings", "characters", "characterMetadata", "characterPortraits"], "readwrite");
        transaction.objectStore("contentPacks").put({
          packId: ${JSON.stringify(fixture.manifest.packId)},
          manifest: ${JSON.stringify(fixture.manifest)},
          encodedPack: encoded,
          origin: "personal",
        });
        transaction.objectStore("contentPackMetadata").put({
          packId: ${JSON.stringify(fixture.manifest.packId)},
          manifest: ${JSON.stringify(fixture.manifest)},
          origin: "personal",
        });
        transaction.objectStore("settings").put({ key: "active-content-pack", value: ${JSON.stringify(fixture.manifest.packId)} });
        const character = ${JSON.stringify(fixture.character)};
        transaction.objectStore("characters").put(character);
        transaction.objectStore("characterMetadata").put({
          id: character.id,
          title: character.title,
          updatedAt: character.updatedAt,
          effectiveLevel: character.build.effectiveLevel,
          race: character.snapshot.details.Race,
          className: character.snapshot.details.Class,
        });
        if (character.portrait !== undefined)
          transaction.objectStore("characterPortraits").put({
            id: character.id,
            renderedDataUrl: character.portrait.renderedDataUrl,
          });
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

function summarizeRuns(runs) {
  const series = (values) => {
    const sorted = [...values].sort((left, right) => left - right);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.length < 2
        ? 0
        : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          (values.length - 1);
    return {
      count: values.length,
      minimum: sorted[0],
      median: sorted[Math.floor(sorted.length / 2)],
      maximum: sorted.at(-1),
      sampleStandardDeviation: Math.sqrt(variance),
    };
  };
  return {
    directEditorMilliseconds: series(
      runs.map(({ directEditorMilliseconds }) => directEditorMilliseconds),
    ),
    warmReopenMilliseconds: series(
      runs.map(({ warmReopenMilliseconds }) => warmReopenMilliseconds),
    ),
    candidateQueryToPaintMilliseconds: series(
      runs.flatMap(({ candidateSearches }) =>
        candidateSearches.map(({ milliseconds }) => milliseconds),
      ),
    ),
    shopQueryToPaintMilliseconds: series(
      runs.flatMap(({ shopSearches }) =>
        shopSearches.map(({ milliseconds }) => milliseconds),
      ),
    ),
    candidateMountedRows: series(
      runs.map(({ candidateMountedRows }) => candidateMountedRows),
    ),
    shopMountedRows: series(runs.map(({ shopMountedRows }) => shopMountedRows)),
    maximumInteractionLongTask: series(
      runs.map(({ maximumInteractionLongTask }) => maximumInteractionLongTask),
    ),
    warmTabAdditionalWorkers: series(
      runs.map(({ warmTabAdditionalWorkers }) => warmTabAdditionalWorkers),
    ),
  };
}

async function bundleMetrics(directory) {
  const files = await walk(directory);
  const assets = [];
  for (const file of files) {
    if (![".js", ".css"].includes(extname(file))) continue;
    const bytes = await readFile(file);
    assets.push({
      file: relative(directory, file),
      bytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
    });
  }
  assets.sort((left, right) => right.bytes - left.bytes);
  const indexHtml = await readFile(join(directory, "index.html"), "utf8");
  const initialJavascriptFiles = new Set(
    [
      ...indexHtml.matchAll(/(?:src|href)="\/?([^"?]+\.js)(?:\?[^" ]*)?"/gu),
    ].map((match) => match[1]),
  );
  const initialJavascriptAssets = assets.filter(({ file }) =>
    initialJavascriptFiles.has(file),
  );
  const routeJavascript = Object.fromEntries(
    ["CharacterEditorPage", "CharacterSheetPage", "SettingsPage"].flatMap(
      (route) => {
        const asset = assets.find(
          ({ file }) =>
            file.startsWith(`assets/${route}-`) && file.endsWith(".js"),
        );
        return asset === undefined ? [] : [[route, asset]];
      },
    ),
  );
  return {
    assets,
    initialRouteJavascript: {
      ...totals(initialJavascriptAssets),
      files: [...initialJavascriptFiles].sort(),
    },
    routeJavascript,
    javascript: totals(assets.filter(({ file }) => file.endsWith(".js"))),
    css: totals(assets.filter(({ file }) => file.endsWith(".css"))),
    javascriptChunkCount: assets.filter(({ file }) => file.endsWith(".js"))
      .length,
  };
}

function totals(assets) {
  return {
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
  };
}

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    if ((await stat(path)).isDirectory()) output.push(...(await walk(path)));
    else output.push(path);
  }
  return output;
}

async function screenshot(client, path) {
  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(data, "base64"));
}

async function click(client, selector) {
  await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) throw new Error("Clickable element not found");
      element.click();
    })()`,
  );
}

// Stage 3: the candidate table mounts at most 200 result rows, but paging must
// still reach every filtered row, reset on sort/filter, and return the scroll
// viewport to the top.
async function checkCandidatePaging(client, outputDirectory) {
  const rows = `.candidate-selection-table tbody tr:not(.selection-type-row)`;
  const pager = `.candidate-selection-table .selection-table-pagination`;
  const state = () =>
    evaluate(
      client,
      `(() => {
        const pager = document.querySelector(${JSON.stringify(pager)});
        const firstRow = document.querySelector(${JSON.stringify(rows)});
        return {
          label: pager?.querySelector("span")?.textContent ?? null,
          previousDisabled: pager?.querySelector("button:first-of-type")?.disabled ?? null,
          nextDisabled: pager?.querySelector("button:last-of-type")?.disabled ?? null,
          mountedRows: document.querySelectorAll(${JSON.stringify(rows)}).length,
          firstRowText: firstRow?.textContent ?? null,
          scrollTop: document.querySelector(".candidate-selection-table .selection-table-scroll")?.scrollTop ?? null,
        };
      })()`,
    );
  const first = await state();
  const match = /^Rows 1–200 of ([\d,]+)$/.exec(first.label ?? "");
  assert(match, `Expected a first-page candidate pager, got ${first.label}`);
  const total = Number(match[1].replaceAll(",", ""));
  assert(total > 200, `Expected more than 200 candidate rows, got ${total}`);
  assert(first.mountedRows === 200, `First page mounted ${first.mountedRows}`);
  assert(first.previousDisabled === true, "Previous should start disabled");

  await evaluate(
    client,
    `document.querySelector(".candidate-selection-table .selection-table-scroll").scrollTop = 500`,
  );
  let reached = first.mountedRows;
  let page = first;
  let pageCount = 1;
  while (page.nextDisabled === false) {
    const previousLabel = page.label;
    await click(client, `${pager} button:last-of-type`);
    await waitForExpression(
      client,
      `document.querySelector(${JSON.stringify(`${pager} span`)})?.textContent !== ${JSON.stringify(previousLabel)}`,
    );
    page = await state();
    pageCount += 1;
    assert(page.mountedRows <= 200, `Page mounted ${page.mountedRows} rows`);
    assert(page.scrollTop === 0, "Paging should scroll the table to the top");
    assert(page.firstRowText !== first.firstRowText, "Page did not change");
    reached += page.mountedRows;
    if (pageCount === 2)
      await screenshot(
        client,
        join(outputDirectory, "candidate-table-page-2.png"),
      );
  }
  assert(
    reached === total,
    `Paging reached ${reached} of ${total} candidate rows`,
  );

  await click(client, `.candidate-selection-table th[aria-sort] button`);
  await waitForExpression(
    client,
    `document.querySelector(${JSON.stringify(`${pager} span`)})?.textContent?.startsWith("Rows 1–")`,
  );
  const sorted = await state();
  assert(sorted.previousDisabled === true, "Sorting should return to page 1");

  await click(client, `${pager} button:last-of-type`);
  const narrowed = await measuredInput(
    client,
    `.candidate-selection-table input[type="search"]`,
    "Baseline Feat 0",
    rows,
  );
  const afterFilter = await state();
  assert(
    afterFilter.label === null || afterFilter.label.startsWith("Rows 1–"),
    `Filtering should return to page 1, got ${afterFilter.label}`,
  );
  assert(narrowed.mountedRows <= 200, "Filtered rows exceeded 200");
  return { total, pageCount };
}

async function setHash(client, hash) {
  await evaluate(client, `location.hash = ${JSON.stringify(hash)}`);
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await waitForExpression(client, `document.readyState === "complete"`);
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails !== undefined)
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        `Browser evaluation failed: ${expression}`,
    );
  return result.result?.value;
}

async function waitForExpression(client, expression, timeout = 45_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeout) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  const diagnostic = await evaluate(
    client,
    `({ href: location.href, text: document.body?.textContent?.slice(0, 2000), html: document.body?.innerHTML?.slice(0, 1000) })`,
  ).catch((reason) => ({ evaluationError: String(reason) }));
  throw new Error(
    `Timed out waiting for browser expression: ${expression}\n${JSON.stringify(diagnostic, null, 2)}`,
  );
}

async function browserVersion(port) {
  return (
    await fetch(`http://127.0.0.1:${port}/json/version`).then((response) =>
      response.json(),
    )
  ).Browser;
}

async function waitForTarget(port) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 30_000) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(
        (response) => response.json(),
      );
      const page = targets.find((target) => target.type === "page");
      if (page !== undefined) return page;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for Chromium debugging target");
}

async function waitForHttp(url) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Unable to allocate port");
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}

function collectProcess(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  return new Promise((resolveOutput, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolveOutput(stdout);
      else reject(new Error(stderr || `Process exited ${code}`));
    });
  });
}

function processExit(child) {
  return new Promise((resolveExit) => child.once("exit", resolveExit));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

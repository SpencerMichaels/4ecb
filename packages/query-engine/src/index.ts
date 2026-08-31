import type { ContentEntity, ContentNode } from "@4ecb/content-domain";

export const COMPENDIUM_QUERY_VERSION = 1;

export type FacetKey =
  | "type"
  | "source"
  | "tier"
  | "usage"
  | "action"
  | "keyword"
  | "slot"
  | "rarity"
  | "class"
  | "race"
  | "ability"
  | "category";

export const FACET_KEYS: readonly FacetKey[] = [
  "type",
  "source",
  "tier",
  "usage",
  "action",
  "keyword",
  "slot",
  "rarity",
  "class",
  "race",
  "ability",
  "category",
];

export interface FacetFilter {
  readonly key: FacetKey;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface NumericRangeFilter {
  readonly field: string;
  readonly minimum?: number;
  readonly maximum?: number;
}

export type CompendiumSortKey =
  "relevance" | "name" | "type" | "level" | "source";
export type SortDirection = "ascending" | "descending";

export interface CompendiumQuery {
  readonly version: typeof COMPENDIUM_QUERY_VERSION;
  readonly text: string;
  readonly facets: readonly FacetFilter[];
  readonly ranges: readonly NumericRangeFilter[];
  readonly relatedTo?: string;
  readonly sort: {
    readonly key: CompendiumSortKey;
    readonly direction: SortDirection;
  };
  readonly page: {
    readonly offset: number;
    readonly limit: number;
  };
}

export interface FacetValueCount {
  readonly value: string;
  readonly count: number;
}

export interface FacetResult {
  readonly key: FacetKey;
  readonly values: readonly FacetValueCount[];
}

export interface CompendiumResultItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly source: string;
  readonly level?: number;
  readonly summary: string;
  readonly score: number;
}

export interface CompendiumQueryResult {
  readonly query: CompendiumQuery;
  readonly total: number;
  readonly items: readonly CompendiumResultItem[];
  readonly facets: readonly FacetResult[];
  readonly elapsedMilliseconds: number;
}

export interface EntityRelationships {
  readonly entityId: string;
  readonly references: readonly CompendiumResultItem[];
  readonly referencedBy: readonly CompendiumResultItem[];
}

interface ParsedTextQuery {
  readonly terms: readonly string[];
  readonly phrases: readonly string[];
}

interface IndexedDocument {
  readonly entity: ContentEntity;
  readonly normalizedName: string;
  readonly normalizedText: string;
  readonly tokens: ReadonlySet<string>;
  readonly facets: ReadonlyMap<FacetKey, readonly string[]>;
  readonly normalizedFacets: ReadonlyMap<FacetKey, ReadonlySet<string>>;
  readonly numericFields: ReadonlyMap<string, number>;
  readonly summary: string;
  readonly references: ReadonlySet<string>;
}

const FACET_FIELD_NAMES: Readonly<
  Record<Exclude<FacetKey, "type" | "source" | "category">, readonly string[]>
> = {
  tier: ["tier"],
  usage: ["power usage", "usage"],
  action: ["action type", "action"],
  keyword: ["keywords", "keyword"],
  slot: ["item slot", "slot"],
  rarity: ["rarity"],
  class: ["class", "classes"],
  race: ["race", "races"],
  ability: ["ability", "key ability", "abilities"],
};

const DISPLAY_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}_:+.'-]+/gu, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalize(value);
  return normalized.length === 0 ? [] : normalized.split(/\s+/u);
}

export function parseTextQuery(value: string): ParsedTextQuery {
  const terms: string[] = [];
  const phrases: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/gu;
  for (const match of value.matchAll(pattern)) {
    const phrase = match[1];
    if (phrase !== undefined) {
      const normalizedPhrase = normalize(phrase);
      if (normalizedPhrase.length > 0) phrases.push(normalizedPhrase);
      continue;
    }
    const term = match[2];
    if (term !== undefined) terms.push(...tokenize(term));
  }
  return { terms: [...new Set(terms)], phrases: [...new Set(phrases)] };
}

function splitFacetValues(value: string): string[] {
  return value
    .split(/[,;|]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function uniqueSorted(values: readonly string[]): string[] {
  const byNormalized = new Map<string, string>();
  for (const value of values) {
    const key = normalize(value);
    if (key.length > 0 && !byNormalized.has(key))
      byNormalized.set(key, value.trim());
  }
  return [...byNormalized.values()].sort((left, right) =>
    left.localeCompare(right),
  );
}

function valuesForField(
  entity: ContentEntity,
  names: readonly string[],
): string[] {
  const expected = new Set(names.map(normalize));
  return entity.specifics
    .filter((field) => expected.has(normalize(field.name)))
    .flatMap((field) => splitFacetValues(field.value));
}

function resolveFacetValues(
  values: readonly string[],
  idNames: ReadonlyMap<string, string>,
): string[] {
  return uniqueSorted(
    values.map((value) => idNames.get(value.toLocaleLowerCase()) ?? value),
  );
}

function facetsForEntity(
  entity: ContentEntity,
  idNames: ReadonlyMap<string, string>,
): Map<FacetKey, readonly string[]> {
  const facets = new Map<FacetKey, readonly string[]>();
  facets.set("type", [entity.type]);
  facets.set(
    "source",
    uniqueSorted(entity.sources.length > 0 ? entity.sources : [entity.source]),
  );
  facets.set("category", resolveFacetValues(entity.categories, idNames));
  for (const key of Object.keys(FACET_FIELD_NAMES) as Array<
    keyof typeof FACET_FIELD_NAMES
  >) {
    let values = valuesForField(entity, FACET_FIELD_NAMES[key]);
    if (key === "tier") {
      values = [
        ...values,
        ...entity.categories.filter((category) =>
          /^(heroic|paragon|epic) tier$/iu.test(category),
        ),
      ];
    }
    facets.set(key, resolveFacetValues(values, idNames));
  }
  return facets;
}

function firstNumber(value: string): number | undefined {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/u);
  if (match === null) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numericFieldsForEntity(entity: ContentEntity): Map<string, number> {
  const fields = new Map<string, number>();
  for (const field of entity.specifics) {
    const parsed = firstNumber(field.value);
    if (parsed !== undefined && !fields.has(normalize(field.name))) {
      fields.set(normalize(field.name), parsed);
    }
  }
  if (!fields.has("level")) {
    const categoryLevel = entity.categories
      .map(firstNumber)
      .find((value): value is number => value !== undefined);
    if (categoryLevel !== undefined) fields.set("level", categoryLevel);
  }
  return fields;
}

function searchableText(entity: ContentEntity): string {
  return [
    entity.id,
    entity.name,
    entity.type,
    entity.source,
    ...entity.sources,
    ...entity.categories,
    entity.flavor ?? "",
    entity.prerequisites ?? "",
    entity.printPrerequisites ?? "",
    entity.description,
    ...entity.specifics.flatMap((field) => [field.name, field.value]),
    ...entity.rules.flatMap((rule) => [
      rule.name,
      rule.text,
      ...rule.attributes.flatMap((attribute) => [
        attribute.name,
        attribute.value,
      ]),
      ...contentNodeText(rule.children),
    ]),
    ...entity.extensions.flatMap((extension) =>
      contentNodeText([extension.node]),
    ),
  ].join("\n");
}

function contentNodeText(nodes: readonly ContentNode[]): string[] {
  return nodes.flatMap((node): string[] => {
    if (node.kind === "comment") return [];
    if (node.kind === "text") return [node.value];
    return [
      node.name,
      ...node.attributes.flatMap((attribute) => [
        attribute.name,
        attribute.value,
      ]),
      ...contentNodeText(node.children),
    ];
  });
}

function summaryForEntity(entity: ContentEntity): string {
  const preferred = entity.specifics.find(
    (field) => normalize(field.name) === "short description",
  )?.value;
  const value = preferred ?? entity.flavor ?? entity.description;
  const collapsed = value.replace(/\s+/gu, " ").trim();
  return collapsed.length > 240 ? `${collapsed.slice(0, 237)}…` : collapsed;
}

function referencesForEntity(
  entity: ContentEntity,
  knownIds: ReadonlySet<string>,
): Set<string> {
  const references = new Set<string>();
  const candidates = [
    entity.prerequisites ?? "",
    entity.printPrerequisites ?? "",
    ...entity.categories,
    ...entity.attributes.map((attribute) => attribute.value),
    ...entity.specifics.map((field) => field.value),
    ...entity.rules.flatMap((rule) => [
      rule.text,
      ...rule.attributes.map((attribute) => attribute.value),
    ]),
  ];
  for (const candidate of candidates) {
    for (const match of candidate.matchAll(/ID_[\p{L}\p{N}_.:-]+/giu)) {
      const id = match[0];
      if (
        id !== undefined &&
        id.toLocaleLowerCase() !== entity.id.toLocaleLowerCase() &&
        knownIds.has(id.toLocaleLowerCase())
      )
        references.add(id.toLocaleLowerCase());
    }
  }
  return references;
}

function defaultQuery(): CompendiumQuery {
  return {
    version: COMPENDIUM_QUERY_VERSION,
    text: "",
    facets: [],
    ranges: [],
    sort: { key: "name", direction: "ascending" },
    page: { offset: 0, limit: 50 },
  };
}

export function normalizeCompendiumQuery(
  query: Partial<CompendiumQuery>,
): CompendiumQuery {
  const fallback = defaultQuery();
  const allowedSortKeys = new Set<CompendiumSortKey>([
    "relevance",
    "name",
    "type",
    "level",
    "source",
  ]);
  const facets = (query.facets ?? [])
    .filter((filter) => FACET_KEYS.includes(filter.key))
    .map((filter) => ({
      key: filter.key,
      include: uniqueSorted(filter.include),
      exclude: uniqueSorted(filter.exclude),
    }))
    .filter((filter) => filter.include.length > 0 || filter.exclude.length > 0);
  const ranges = (query.ranges ?? []).flatMap((range) => {
    const field = normalize(range.field);
    if (field.length === 0) return [];
    const normalizedRange: {
      field: string;
      minimum?: number;
      maximum?: number;
    } = { field };
    if (typeof range.minimum === "number" && Number.isFinite(range.minimum)) {
      normalizedRange.minimum = range.minimum;
    }
    if (typeof range.maximum === "number" && Number.isFinite(range.maximum)) {
      normalizedRange.maximum = range.maximum;
    }
    return normalizedRange.minimum === undefined &&
      normalizedRange.maximum === undefined
      ? []
      : [normalizedRange];
  });
  const requestedLimit = Math.trunc(query.page?.limit ?? fallback.page.limit);
  const requestedOffset = Math.trunc(query.page?.offset ?? 0);
  const requestedSort = query.sort?.key;
  const normalized: CompendiumQuery = {
    version: COMPENDIUM_QUERY_VERSION,
    text: query.text?.trim() ?? "",
    facets,
    ranges,
    sort: {
      key:
        requestedSort !== undefined && allowedSortKeys.has(requestedSort)
          ? requestedSort
          : fallback.sort.key,
      direction:
        query.sort?.direction === "descending" ? "descending" : "ascending",
    },
    page: {
      offset: Math.max(0, requestedOffset),
      limit: Math.min(200, Math.max(1, requestedLimit)),
    },
  };
  if (query.relatedTo !== undefined && query.relatedTo.trim().length > 0) {
    return { ...normalized, relatedTo: query.relatedTo.trim() };
  }
  return normalized;
}

export function serializeCompendiumQuery(
  input: Partial<CompendiumQuery>,
): string {
  const query = normalizeCompendiumQuery(input);
  const parameters = new URLSearchParams();
  if (query.text.length > 0) parameters.set("q", query.text);
  for (const filter of query.facets) {
    for (const value of filter.include)
      parameters.append(`i.${filter.key}`, value);
    for (const value of filter.exclude)
      parameters.append(`x.${filter.key}`, value);
  }
  for (const range of query.ranges) {
    if (range.minimum !== undefined)
      parameters.set(`min.${range.field}`, String(range.minimum));
    if (range.maximum !== undefined)
      parameters.set(`max.${range.field}`, String(range.maximum));
  }
  if (query.relatedTo !== undefined) parameters.set("related", query.relatedTo);
  parameters.set("sort", query.sort.key);
  parameters.set("direction", query.sort.direction);
  parameters.set("offset", String(query.page.offset));
  parameters.set("limit", String(query.page.limit));
  return parameters.toString();
}

function finiteParameter(
  parameters: URLSearchParams,
  key: string,
): number | undefined {
  const value = parameters.get(key);
  if (value === null || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function deserializeCompendiumQuery(value: string): CompendiumQuery {
  const parameters = new URLSearchParams(
    value.startsWith("?") ? value.slice(1) : value,
  );
  const facets: FacetFilter[] = FACET_KEYS.flatMap((key) => {
    const include = parameters.getAll(`i.${key}`);
    const exclude = parameters.getAll(`x.${key}`);
    return include.length === 0 && exclude.length === 0
      ? []
      : [{ key, include, exclude }];
  });
  const rangeFields = new Set<string>();
  for (const key of parameters.keys()) {
    if (key.startsWith("min.") || key.startsWith("max."))
      rangeFields.add(key.slice(4));
  }
  const ranges = [...rangeFields].map((field) => {
    const minimum = finiteParameter(parameters, `min.${field}`);
    const maximum = finiteParameter(parameters, `max.${field}`);
    return {
      field,
      ...(minimum === undefined ? {} : { minimum }),
      ...(maximum === undefined ? {} : { maximum }),
    };
  });
  return normalizeCompendiumQuery({
    text: parameters.get("q") ?? "",
    facets,
    ranges,
    ...(parameters.get("related") === null
      ? {}
      : { relatedTo: parameters.get("related") ?? "" }),
    sort: {
      key: (parameters.get("sort") ?? "name") as CompendiumSortKey,
      direction:
        parameters.get("direction") === "descending"
          ? "descending"
          : "ascending",
    },
    page: {
      offset: finiteParameter(parameters, "offset") ?? 0,
      limit: finiteParameter(parameters, "limit") ?? 50,
    },
  });
}

function resultItem(
  document: IndexedDocument,
  score: number,
): CompendiumResultItem {
  const level = document.numericFields.get("level");
  return {
    id: document.entity.id,
    name: document.entity.name,
    type: document.entity.type,
    source: document.entity.source,
    ...(level === undefined ? {} : { level }),
    summary: document.summary,
    score,
  };
}

function compareText(left: string, right: string): number {
  return DISPLAY_COLLATOR.compare(left, right);
}

export class CompendiumIndex {
  readonly #documents: readonly IndexedDocument[];
  readonly #byId: ReadonlyMap<string, number>;
  readonly #inverted: ReadonlyMap<string, readonly number[]>;
  readonly #inbound: ReadonlyMap<string, ReadonlySet<string>>;

  constructor(entities: readonly ContentEntity[]) {
    const knownIds = new Set(
      entities.map((entity) => entity.id.toLocaleLowerCase()),
    );
    const idNames = new Map(
      entities.map((entity) => [entity.id.toLocaleLowerCase(), entity.name]),
    );
    const mutableInverted = new Map<string, number[]>();
    const byId = new Map<string, number>();
    this.#documents = entities.map((entity, index) => {
      const fullText = searchableText(entity);
      const tokens = new Set(tokenize(fullText));
      const facets = facetsForEntity(entity, idNames);
      for (const token of tokens) {
        const postings = mutableInverted.get(token);
        if (postings === undefined) mutableInverted.set(token, [index]);
        else postings.push(index);
      }
      byId.set(entity.id.toLocaleLowerCase(), index);
      return {
        entity,
        normalizedName: normalize(entity.name),
        normalizedText: normalize(fullText),
        tokens,
        facets,
        normalizedFacets: new Map(
          [...facets].map(([key, values]) => [
            key,
            new Set(values.map(normalize)),
          ]),
        ),
        numericFields: numericFieldsForEntity(entity),
        summary: summaryForEntity(entity),
        references: referencesForEntity(entity, knownIds),
      };
    });
    this.#byId = byId;
    this.#inverted = mutableInverted;
    const inbound = new Map<string, Set<string>>();
    for (const document of this.#documents) {
      for (const reference of document.references) {
        const references = inbound.get(reference);
        if (references === undefined)
          inbound.set(
            reference,
            new Set([document.entity.id.toLocaleLowerCase()]),
          );
        else references.add(document.entity.id.toLocaleLowerCase());
      }
    }
    this.#inbound = inbound;
  }

  get size(): number {
    return this.#documents.length;
  }

  getEntity(id: string): ContentEntity | undefined {
    const index = this.#byId.get(id.toLocaleLowerCase());
    return index === undefined ? undefined : this.#documents[index]?.entity;
  }

  relationships(id: string): EntityRelationships | undefined {
    const normalizedId = id.toLocaleLowerCase();
    const index = this.#byId.get(normalizedId);
    const document = index === undefined ? undefined : this.#documents[index];
    if (document === undefined) return undefined;
    const resolve = (ids: Iterable<string>): CompendiumResultItem[] =>
      [...ids]
        .flatMap((relatedId) => {
          const relatedIndex = this.#byId.get(relatedId);
          const related =
            relatedIndex === undefined
              ? undefined
              : this.#documents[relatedIndex];
          return related === undefined ? [] : [resultItem(related, 0)];
        })
        .sort(
          (left, right) =>
            compareText(left.name, right.name) ||
            compareText(left.id, right.id),
        );
    return {
      entityId: document.entity.id,
      references: resolve(document.references),
      referencedBy: resolve(this.#inbound.get(normalizedId) ?? []),
    };
  }

  query(input: Partial<CompendiumQuery>): CompendiumQueryResult {
    const started = performance.now();
    const query = normalizeCompendiumQuery(input);
    const parsed = parseTextQuery(query.text);
    let candidates: number[];
    if (parsed.terms.length === 0) {
      candidates = this.#documents.map((_, index) => index);
    } else {
      const postings = parsed.terms.map(
        (term) => this.#inverted.get(term) ?? [],
      );
      postings.sort((left, right) => left.length - right.length);
      candidates = [...(postings[0] ?? [])].filter((candidate) => {
        const document = this.#documents[candidate];
        return (
          document !== undefined &&
          parsed.terms.every((term) => document.tokens.has(term))
        );
      });
    }

    const related =
      query.relatedTo === undefined
        ? undefined
        : this.relationships(query.relatedTo);
    const relatedIds =
      query.relatedTo === undefined
        ? undefined
        : new Set(
            related === undefined
              ? []
              : [...related.references, ...related.referencedBy].map((item) =>
                  item.id.toLocaleLowerCase(),
                ),
          );
    const normalizedFacetFilters = query.facets.map((filter) => ({
      key: filter.key,
      include: filter.include.map(normalize),
      exclude: filter.exclude.map(normalize),
    }));
    const normalizedRanges = query.ranges.map((range) => ({
      ...range,
      field: normalize(range.field),
    }));
    const matchesFacetFilters = (
      document: IndexedDocument,
      omittedKey?: FacetKey,
    ): boolean =>
      normalizedFacetFilters.every((filter) => {
        if (filter.key === omittedKey) return true;
        const values =
          document.normalizedFacets.get(filter.key) ?? new Set<string>();
        return (
          (filter.include.length === 0 ||
            filter.include.some((value) => values.has(value))) &&
          !filter.exclude.some((value) => values.has(value))
        );
      });
    const eligibleDocuments: IndexedDocument[] = [];
    for (const candidate of candidates) {
      const document = this.#documents[candidate];
      if (document === undefined) continue;
      if (
        parsed.phrases.some(
          (phrase) => !document.normalizedText.includes(phrase),
        )
      )
        continue;
      if (
        relatedIds !== undefined &&
        !relatedIds.has(document.entity.id.toLocaleLowerCase())
      )
        continue;
      if (
        !normalizedRanges.every((range) => {
          const value = document.numericFields.get(range.field);
          return (
            value !== undefined &&
            (range.minimum === undefined || value >= range.minimum) &&
            (range.maximum === undefined || value <= range.maximum)
          );
        })
      )
        continue;
      eligibleDocuments.push(document);
    }

    const scored: Array<{ document: IndexedDocument; score: number }> = [];
    for (const document of eligibleDocuments) {
      if (!matchesFacetFilters(document)) continue;
      let score = 0;
      if (parsed.terms.length > 0 || parsed.phrases.length > 0) {
        const normalizedSearch = normalize(query.text.replaceAll('"', ""));
        if (document.normalizedName === normalizedSearch) score += 1000;
        else if (document.normalizedName.startsWith(normalizedSearch))
          score += 400;
        for (const term of parsed.terms) {
          if (document.normalizedName.split(/\s+/u).includes(term))
            score += 100;
          else if (document.tokens.has(term)) score += 10;
        }
        score += parsed.phrases.length * 150;
      }
      scored.push({ document, score });
    }

    const direction = query.sort.direction === "descending" ? -1 : 1;
    scored.sort((left, right) => {
      if (query.sort.key === "level") {
        const leftLevel = left.document.numericFields.get("level");
        const rightLevel = right.document.numericFields.get("level");
        if (leftLevel === undefined && rightLevel !== undefined) return 1;
        if (leftLevel !== undefined && rightLevel === undefined) return -1;
        if (leftLevel !== undefined && rightLevel !== undefined) {
          const levelComparison = (leftLevel - rightLevel) * direction;
          if (levelComparison !== 0) return levelComparison;
        }
      }
      let comparison = 0;
      switch (query.sort.key) {
        case "relevance":
          comparison = left.score - right.score;
          break;
        case "name":
          comparison = compareText(
            left.document.entity.name,
            right.document.entity.name,
          );
          break;
        case "type":
          comparison = compareText(
            left.document.entity.type,
            right.document.entity.type,
          );
          break;
        case "level":
          break;
        case "source":
          comparison = compareText(
            left.document.entity.source,
            right.document.entity.source,
          );
          break;
      }
      return (
        comparison * direction ||
        compareText(left.document.entity.name, right.document.entity.name) ||
        compareText(left.document.entity.id, right.document.entity.id)
      );
    });

    const facetResults = FACET_KEYS.map((key): FacetResult => {
      const counts = new Map<string, { value: string; count: number }>();
      const hasOwnFilter = normalizedFacetFilters.some(
        (filter) => filter.key === key,
      );
      const facetDocuments = hasOwnFilter
        ? eligibleDocuments
        : scored.map((entry) => entry.document);
      for (const document of facetDocuments) {
        if (hasOwnFilter && !matchesFacetFilters(document, key)) continue;
        for (const value of document.facets.get(key) ?? []) {
          const normalizedValue = normalize(value);
          const existing = counts.get(normalizedValue);
          if (existing === undefined)
            counts.set(normalizedValue, { value, count: 1 });
          else existing.count += 1;
        }
      }
      return {
        key,
        values: [...counts.values()]
          .sort(
            (left, right) =>
              right.count - left.count || compareText(left.value, right.value),
          )
          .map(({ value, count }) => ({ value, count })),
      };
    });
    const page = scored.slice(
      query.page.offset,
      query.page.offset + query.page.limit,
    );
    return {
      query,
      total: scored.length,
      items: page.map((entry) => resultItem(entry.document, entry.score)),
      facets: facetResults,
      elapsedMilliseconds: performance.now() - started,
    };
  }
}

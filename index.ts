import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const DEFAULT_SEARXNG_URL = "http://127.0.0.1:8080";
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 15_000;

type TimeRange = "day" | "month" | "year";
type SafeSearch = 0 | 1 | 2;

type WebSearchParams = {
  query: string;
  max_results?: number;
  categories?: string;
  engines?: string;
  language?: string;
  time_range?: TimeRange;
  safesearch?: SafeSearch;
  page?: number;
  base_url?: string;
  timeout_ms?: number;
};

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  engine?: unknown;
  engines?: unknown;
  category?: unknown;
  score?: unknown;
  publishedDate?: unknown;
  published_date?: unknown;
};

type SearxngResponse = {
  results?: unknown;
  suggestions?: unknown;
  answers?: unknown;
  infoboxes?: unknown;
  corrections?: unknown;
  unresponsive_engines?: unknown;
};

type NormalizedSearchResult = {
  title: string;
  url: string;
  content?: string;
  engine?: string;
  engines?: string[];
  category?: string;
  score?: number;
  publishedDate?: string;
};

type WebSearchDetails = {
  query: string;
  baseUrl: string;
  count: number;
  page: number;
  results: NormalizedSearchResult[];
  suggestions?: string[];
  answers?: string[];
  infoboxes?: unknown[];
  corrections?: string[];
  unresponsiveEngines?: unknown[];
};

function clampInteger(value: number | undefined, defaultValue: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return defaultValue;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeBaseUrl(value: string | undefined): string {
  const baseUrl = value?.trim() || process.env.SEARXNG_URL?.trim() || DEFAULT_SEARXNG_URL;
  return baseUrl.replace(/\/+$/, "");
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.flatMap((item) => {
    const normalized = asString(item);
    return normalized ? [normalized] : [];
  });
  return values.length > 0 ? values : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function normalizeSearchResult(result: SearxngResult): NormalizedSearchResult | undefined {
  const url = asString(result.url);
  if (!url) return undefined;

  const title = asString(result.title) ?? url;
  const content = asString(result.content);
  const engine = asString(result.engine);
  const engines = asStringArray(result.engines);
  const category = asString(result.category);
  const score = asNumber(result.score);
  const publishedDate = asString(result.publishedDate) ?? asString(result.published_date);

  return {
    title,
    url,
    ...(content ? { content } : {}),
    ...(engine ? { engine } : {}),
    ...(engines ? { engines } : {}),
    ...(category ? { category } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(publishedDate ? { publishedDate } : {}),
  };
}

function normalizeResults(results: unknown, maxResults: number): NormalizedSearchResult[] {
  if (!Array.isArray(results)) return [];

  const seenUrls = new Set<string>();
  const normalized: NormalizedSearchResult[] = [];

  for (const item of results) {
    if (!item || typeof item !== "object") continue;

    const result = normalizeSearchResult(item as SearxngResult);
    if (!result || seenUrls.has(result.url)) continue;

    seenUrls.add(result.url);
    normalized.push(result);

    if (normalized.length >= maxResults) break;
  }

  return normalized;
}

function truncateSnippet(value: string | undefined, maxLength = 240): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildSearchUrl(params: WebSearchParams, baseUrl: string, maxResults: number, page: number): URL {
  const url = new URL("/search", `${baseUrl}/`);
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageno", String(page));

  if (params.categories) url.searchParams.set("categories", params.categories);
  if (params.engines) url.searchParams.set("engines", params.engines);
  if (params.language) url.searchParams.set("language", params.language);
  if (params.time_range) url.searchParams.set("time_range", params.time_range);
  if (params.safesearch !== undefined) url.searchParams.set("safesearch", String(params.safesearch));

  // Some SearXNG instances honor this preference, but we still slice locally.
  url.searchParams.set("results_on_new_tab", "0");
  url.searchParams.set("theme", "simple");
  url.searchParams.set("count", String(maxResults));

  return url;
}

function buildResponseText(query: string, results: NormalizedSearchResult[]): string {
  if (results.length === 0) {
    return `No results found for: ${query}`;
  }

  const lines = [`Search results for: ${query}`, ""];

  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   URL: ${result.url}`);

    const snippet = truncateSnippet(result.content);
    if (snippet) lines.push(`   ${snippet}`);

    const source = result.engine ?? result.engines?.join(", ");
    const metadata = [source, result.publishedDate, result.category].filter(Boolean).join(" · ");
    if (metadata) lines.push(`   ${metadata}`);

    if (index < results.length - 1) lines.push("");
  });

  return lines.join("\n");
}

function buildConnectionError(baseUrl: string): string {
  return [
    `Could not connect to SearXNG at ${baseUrl}.`,
    "",
    "Start a local SearXNG instance and ensure JSON output is enabled.",
    "This package includes an example compose setup in the searxng/ directory.",
    "See: https://docs.searxng.org/admin/installation-docker.html",
  ].join("\n");
}

function createTimeoutSignal(parentSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!parentSignal) return timeoutSignal;
  return AbortSignal.any([parentSignal, timeoutSignal]);
}

async function fetchSearxngJson(url: URL, signal: AbortSignal): Promise<SearxngResponse> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`SearXNG search failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`);
  }

  return (await response.json()) as SearxngResponse;
}

function normalizeOptionalStringList(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  return asStringArray(value);
}

function getHostName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function piSearxngSearchExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "web_search",
    description:
      "Search the web using a local SearXNG instance. Returns compact search results with titles, URLs, and snippets. Use web_fetch or batch_web_fetch separately when page contents are needed.",
    promptSnippet:
      "web_search(query, max_results?): search a local SearXNG instance and return compact SERP-style results; use web_fetch separately to read pages",
    promptGuidelines: [
      "Use web_search to discover relevant URLs for current or external information; use web_fetch or batch_web_fetch separately when page contents are needed.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query to execute." }),
      max_results: Type.Optional(
        Type.Number({
          description: "Maximum number of search results to return. Default: 5.",
          default: DEFAULT_MAX_RESULTS,
          minimum: 1,
          maximum: MAX_RESULTS_LIMIT,
        }),
      ),
      categories: Type.Optional(Type.String({ description: "Comma-separated SearXNG categories to search." })),
      engines: Type.Optional(Type.String({ description: "Comma-separated SearXNG engines to use." })),
      language: Type.Optional(Type.String({ description: "Search language code, for example 'en' or 'auto'." })),
      time_range: Type.Optional(
        Type.Union([Type.Literal("day"), Type.Literal("month"), Type.Literal("year")], {
          description: "Restrict results to a time range when supported by selected engines.",
        }),
      ),
      safesearch: Type.Optional(
        Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)], {
          description: "SearXNG safe search level: 0 off, 1 moderate, 2 strict.",
          default: 0,
        }),
      ),
      page: Type.Optional(Type.Number({ description: "Search result page number. Default: 1.", default: 1, minimum: 1 })),
      base_url: Type.Optional(
        Type.String({
          description: `SearXNG base URL. Default: SEARXNG_URL env var or ${DEFAULT_SEARXNG_URL}.`,
        }),
      ),
      timeout_ms: Type.Optional(
        Type.Number({ description: `Request timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`, default: DEFAULT_TIMEOUT_MS }),
      ),
    }),

    async execute(_toolCallId, params: WebSearchParams, signal) {
      const maxResults = clampInteger(params.max_results, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS_LIMIT);
      const page = clampInteger(params.page, 1, 1, 1_000);
      const timeoutMs = clampInteger(params.timeout_ms, DEFAULT_TIMEOUT_MS, 1_000, 120_000);
      const baseUrl = normalizeBaseUrl(params.base_url);
      const url = buildSearchUrl(params, baseUrl, maxResults, page);

      let data: SearxngResponse;
      try {
        data = await fetchSearxngJson(url, createTimeoutSignal(signal, timeoutMs));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("fetch failed") || message.includes("ECONNREFUSED") || message.includes("Failed to fetch")) {
          throw new Error(buildConnectionError(baseUrl));
        }
        throw error;
      }

      const results = normalizeResults(data.results, maxResults);
      const details: WebSearchDetails = {
        query: params.query,
        baseUrl,
        count: results.length,
        page,
        results,
        suggestions: normalizeOptionalStringList(data.suggestions),
        answers: normalizeOptionalStringList(data.answers),
        infoboxes: Array.isArray(data.infoboxes) ? data.infoboxes : undefined,
        corrections: normalizeOptionalStringList(data.corrections),
        unresponsiveEngines: Array.isArray(data.unresponsive_engines) ? data.unresponsive_engines : undefined,
      };

      return {
        content: [{ type: "text", text: buildResponseText(params.query, results) }],
        details,
      };
    },

    renderCall(args, theme) {
      const query = typeof args.query === "string" ? args.query : "...";
      const maxResults = typeof args.max_results === "number" ? ` (${args.max_results})` : "";
      return new Text(`${theme.fg("toolTitle", theme.bold("web_search "))}${theme.fg("accent", query)}${theme.fg("muted", maxResults)}`, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as WebSearchDetails | undefined;
      if (!details) return new Text(theme.fg("muted", "No search details available."), 0, 0);
      if (details.results.length === 0) return new Text(theme.fg("muted", `No results for ${details.query}`), 0, 0);

      const lines = [theme.fg("toolTitle", theme.bold(`Search results (${details.count})`))];
      details.results.forEach((item, index) => {
        const title = theme.fg("text", item.title);
        const host = theme.fg("accent", getHostName(item.url));
        lines.push(`${index + 1}. ${title} ${theme.fg("muted", "—")} ${host}`);
        if (expanded) {
          lines.push(`   ${theme.fg("dim", item.url)}`);
          const snippet = truncateSnippet(item.content, 160);
          if (snippet) lines.push(`   ${theme.fg("muted", snippet)}`);
        }
      });

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}

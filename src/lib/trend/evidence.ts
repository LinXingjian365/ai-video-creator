// 网页事实/案例证据搜索:Exa 与 Firecrawl 适配层。
// 与 TikHub 源同philosophy:未配 key 时诚实抛错,不伪造结果;endpoint/base 可经 env 覆盖。

export type EvidenceProvider = "exa" | "firecrawl";

export interface EvidenceSearchInput {
  query: string;
  provider?: EvidenceProvider | "auto";
  limit?: number;
  includeContents?: boolean;
}

export interface EvidenceResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  author?: string;
  provider: EvidenceProvider;
}

export interface EvidenceReport {
  provider: EvidenceProvider;
  query: string;
  generatedAt: string;
  results: EvidenceResult[];
  nextActions: string[];
}

interface EvidenceDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
}

const EXA_DEFAULT_BASE = "https://api.exa.ai";
const FIRECRAWL_DEFAULT_BASE = "https://api.firecrawl.dev";
const DEFAULT_LIMIT = 8;
const DEFAULT_TIMEOUT_MS = 20000;
const SNIPPET_MAX = 600;

export async function runEvidenceSearch(input: EvidenceSearchInput, deps: EvidenceDeps = {}): Promise<EvidenceReport> {
  const env = deps.env ?? process.env;
  const query = input.query?.trim();
  if (!query) {
    throw new Error("Provide a non-empty query for evidence search.");
  }
  const limit = clampLimit(input.limit);
  const provider = resolveProvider(input.provider ?? "auto", env);
  const fetchImpl = deps.fetch ?? fetch;

  const results =
    provider === "exa"
      ? await searchExa(query, limit, input.includeContents ?? true, env, fetchImpl)
      : await searchFirecrawl(query, limit, env, fetchImpl);

  const trimmed = results.slice(0, limit);
  return {
    provider,
    query,
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    results: trimmed,
    nextActions: buildNextActions(trimmed, provider)
  };
}

function resolveProvider(pref: EvidenceProvider | "auto", env: Record<string, string | undefined>): EvidenceProvider {
  const hasExa = Boolean(env.EXA_API_KEY);
  const hasFirecrawl = Boolean(env.FIRECRAWL_API_KEY);
  if (pref === "exa") {
    if (!hasExa) {
      throw new Error("Evidence search provider=exa requires EXA_API_KEY.");
    }
    return "exa";
  }
  if (pref === "firecrawl") {
    if (!hasFirecrawl) {
      throw new Error("Evidence search provider=firecrawl requires FIRECRAWL_API_KEY.");
    }
    return "firecrawl";
  }
  if (hasExa) {
    return "exa";
  }
  if (hasFirecrawl) {
    return "firecrawl";
  }
  throw new Error("Evidence search requires EXA_API_KEY or FIRECRAWL_API_KEY. Configure one before web evidence search.");
}

async function searchExa(
  query: string,
  limit: number,
  includeContents: boolean,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch
): Promise<EvidenceResult[]> {
  const url = resolveUrl(env.EXA_BASE_URL || EXA_DEFAULT_BASE, env.EXA_SEARCH_ENDPOINT || "/search");
  const body: Record<string, unknown> = { query, numResults: limit };
  if (includeContents) {
    body.contents = { text: { maxCharacters: SNIPPET_MAX } };
  }
  const raw = await postJson(url, body, { "x-api-key": env.EXA_API_KEY ?? "" }, env, fetchImpl, "Exa");
  return findResultsArray(raw, [["results"], ["data", "results"]])
    .map((item) => ({
      title: firstString(item, ["title", "name"]) || firstString(item, ["url", "id"]),
      url: firstString(item, ["url", "id"]),
      snippet: truncate(firstString(item, ["text", "summary", "snippet", "highlight"]), SNIPPET_MAX),
      publishedAt: optionalDate(item, ["publishedDate", "published_date", "date"]),
      author: firstString(item, ["author"]) || undefined,
      provider: "exa" as const
    }))
    .filter((result) => result.url);
}

async function searchFirecrawl(
  query: string,
  limit: number,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch
): Promise<EvidenceResult[]> {
  const url = resolveUrl(env.FIRECRAWL_BASE_URL || FIRECRAWL_DEFAULT_BASE, env.FIRECRAWL_SEARCH_ENDPOINT || "/v1/search");
  const raw = await postJson(
    url,
    { query, limit },
    { Authorization: `Bearer ${env.FIRECRAWL_API_KEY ?? ""}` },
    env,
    fetchImpl,
    "Firecrawl"
  );
  return findResultsArray(raw, [["data"], ["results"], ["data", "results"]])
    .map((item) => ({
      title: firstString(item, ["title", "name"]) || firstString(item, ["url", "link"]),
      url: firstString(item, ["url", "link"]),
      snippet: truncate(firstString(item, ["description", "markdown", "content", "snippet"]), SNIPPET_MAX),
      publishedAt: optionalDate(item, ["publishedDate", "published_date", "date"]),
      author: undefined,
      provider: "firecrawl" as const
    }))
    .filter((result) => result.url);
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  label: string
) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs(env))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} evidence search HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function buildNextActions(results: EvidenceResult[], provider: EvidenceProvider): string[] {
  if (results.length === 0) {
    return [`${provider} returned no evidence; broaden the query or switch provider.`];
  }
  return [
    "Cite 2-3 of these sources as factual backing in the script; do not invent stats.",
    "Open the top URLs to verify claims before quoting; sources can be outdated or biased."
  ];
}

function resolveUrl(base: string, endpoint: string) {
  if (endpoint.startsWith("http")) {
    return endpoint;
  }
  return `${base.replace(/\/+$/, "")}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
}

function timeoutMs(env: Record<string, string | undefined>) {
  const parsed = Number(env.EVIDENCE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function clampLimit(value: number | undefined) {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 20) : DEFAULT_LIMIT;
}

function findResultsArray(raw: unknown, paths: string[][]): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter(isRecord);
  }
  const root = asRecord(raw);
  for (const path of paths) {
    const value = path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), root);
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [];
}

function truncate(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function optionalDate(item: Record<string, unknown>, keys: string[]) {
  const value = firstString(item, keys);
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function firstString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

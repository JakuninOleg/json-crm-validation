import type { Response } from "openai/resources/responses/responses";
import type { Lead } from "@/lib/schemas";

export type SourceCandidate = { url: string; origin: "search" | "previous" | "both" };

const MAX_PAGES_TO_FETCH = 10;
const MAX_PAGES_PER_HOST = 2;

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of url.searchParams.keys()) {
      if (key.startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return null;
  }
}

function searchUrls(response: Response) {
  const found = new Set<string>();
  const cited = new Set<string>();
  for (const item of response.output) {
    if (item.type === "web_search_call") {
      if (item.action.type === "search") {
        for (const source of item.action.sources ?? []) {
          const url = normalizeUrl(source.url);
          if (url) found.add(url);
        }
      } else if (item.action.type === "open_page" && item.action.url) {
        const url = normalizeUrl(item.action.url);
        if (url) found.add(url);
      }
    }
    if (item.type === "message") {
      for (const content of item.content) {
        if (content.type !== "output_text") continue;
        for (const annotation of content.annotations) {
          if (annotation.type !== "url_citation") continue;
          const url = normalizeUrl(annotation.url);
          if (url) {
            found.add(url);
            cited.add(url);
          }
        }
      }
    }
  }
  return { found, cited };
}

export function selectSourceCandidates(response: Response, lead: Lead, previousUrls: string[]) {
  const { found, cited } = searchUrls(response);
  const previous = new Set(previousUrls.map(normalizeUrl).filter((url): url is string => Boolean(url)));
  const words = lead.company_name.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const ranked = [...found].sort((left, right) => {
    const relevance = (url: string) => words.filter((word) => url.toLowerCase().includes(word)).length;
    return relevance(right) - relevance(left) || left.localeCompare(right);
  });
  const ordered = [...new Set([...previous, ...cited, ...ranked])];
  const candidates: SourceCandidate[] = ordered.map((url) => {
    let origin: SourceCandidate["origin"] = "search";
    if (previous.has(url)) origin = found.has(url) ? "both" : "previous";
    return { url, origin };
  });
  const hostCounts = new Map<string, number>();
  const toFetch: string[] = [];
  for (const { url } of candidates) {
    const host = new URL(url).hostname;
    const count = hostCounts.get(host) ?? 0;
    if (toFetch.length >= MAX_PAGES_TO_FETCH || count >= MAX_PAGES_PER_HOST) continue;
    toFetch.push(url);
    hostCounts.set(host, count + 1);
  }
  return { candidates, toFetch };
}

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export type PublicSource = { id: string; url: string; text: string };
export type SourceResult = { url: string; source?: PublicSource; unavailable: boolean };

const MAX_BYTES = 400_000;
const MAX_REDIRECTS = 3;

function publicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && parts[2] === 0))) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 192 && b === 0 && parts[2] === 2) return false;
  if (a === 198 && b === 51 && parts[2] === 100) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  return true;
}

function decodeHtml(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#(\d+)|#x([\da-f]+));/gi, (entity, decimal: string, hex: string) => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ", "&#39;": "'" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = decimal ? Number(decimal) : Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  });
}

function pageText(html: string) {
  return decodeHtml(html
    .replace(/<(script|style|noscript|svg|footer|nav)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 30_000);
}

async function readPage(address: string, signal: AbortSignal, redirects = 0): Promise<{ url: string; text: string }> {
  const url = new URL(address);
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.port ||
      !url.hostname.includes(".") || isIP(url.hostname) || url.hostname.endsWith(".local")) {
    throw new Error("Unsupported source URL");
  }
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("Source DNS timeout")), 4_000);
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some((entry) => !publicIpv4(entry.address))) throw new Error("Unsafe source address");
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  const response = await new Promise<{ status: number; location?: string; contentType?: string; body: string }>((resolve, reject) => {
    const req = request(url, {
      method: "GET", signal, timeout: 7_000,
      headers: { "User-Agent": "WorrkiLeadCheck/1.0", "Accept": "text/html,text/plain", "Accept-Encoding": "identity" },
      lookup: (_host, options, callback) => {
        const address = addresses[0].address;
        if (options.all) callback(null, [{ address, family: 4 }]);
        else callback(null, address, 4);
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { req.destroy(new Error("Source too large")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        location: res.headers.location,
        contentType: res.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("timeout", () => req.destroy(new Error("Source timeout")));
    req.on("error", reject);
    req.end();
  });

  if ([301, 302, 303, 307, 308].includes(response.status) && response.location && redirects < MAX_REDIRECTS) {
    return readPage(new URL(response.location, url).href, signal, redirects + 1);
  }
  if (response.status !== 200 || !/text\/(?:html|plain)/i.test(response.contentType ?? "")) throw new Error("Source unavailable");
  const text = /text\/html/i.test(response.contentType ?? "") ? pageText(response.body) : response.body.trim().slice(0, 30_000);
  if (text.length < 100 || /(?:404\s*[-:]?\s*page not found|page not found|this page (?:does not exist|is not available))/i.test(text.slice(0, 500))) {
    throw new Error("Empty or missing page");
  }
  return { url: url.href, text };
}

export async function fetchPublicSources(urls: string[], signal: AbortSignal): Promise<SourceResult[]> {
  return Promise.all(urls.slice(0, 6).map(async (url, index) => {
    try {
      const page = await readPage(url, signal);
      return { url, source: { id: `s${index + 1}`, url: page.url, text: page.text }, unavailable: false };
    } catch {
      return { url, unavailable: true };
    }
  }));
}

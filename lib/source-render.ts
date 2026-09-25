import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { SourceReadError, requestPublicResource } from "./source-fetch.ts";

type PageResponse = Awaited<ReturnType<typeof requestPublicResource>>;

const MAX_RESOURCE_REQUESTS = 30;
const RENDER_TIMEOUT_MS = 12_000;
const MAX_ACTIVE_BROWSERS = 2;
let activeBrowsers = 0;
const browserQueue: Array<() => void> = [];

async function reserveBrowser(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  if (activeBrowsers < MAX_ACTIVE_BROWSERS) {
    activeBrowsers += 1;
  } else {
    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        const index = browserQueue.indexOf(resume);
        if (index !== -1) browserQueue.splice(index, 1);
        reject(signal.reason);
      };
      browserQueue.push(resume);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  return () => {
    const next = browserQueue.shift();
    if (next) next();
    else activeBrowsers -= 1;
  };
}

function browserExecutable() {
  if (process.platform !== "win32") return chromium.executablePath();
  const programFiles = process.env.PROGRAMFILES;
  if (!programFiles) throw new SourceReadError("Локальный браузер не найден");
  return `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`;
}

export async function renderPage(initial: PageResponse, signal: AbortSignal) {
  const releaseBrowser = await reserveBrowser(signal);
  const renderSignal = AbortSignal.any([signal, AbortSignal.timeout(RENDER_TIMEOUT_MS)]);
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--disable-background-networking",
        "--disable-extensions",
        "--no-first-run",
        "--proxy-server=127.0.0.1:9",
        "--proxy-bypass-list=<-loopback>",
      ],
      executablePath: await browserExecutable(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    let requests = 0;
    page.on("request", async (request) => {
      try {
        if (renderSignal.aborted) {
          await request.abort();
          return;
        }
        const kind = request.resourceType();
        if (request.method() !== "GET" ||
            (kind === "document" && request.url() !== initial.url) ||
            !["document", "script", "xhr", "fetch"].includes(kind)) {
          await request.abort();
          return;
        }
        if (requests++ >= MAX_RESOURCE_REQUESTS) {
          await request.abort();
          return;
        }
        const resource = request.url() === initial.url
          ? initial
          : await requestPublicResource(request.url(), renderSignal, 0, 1_500_000);
        await request.respond({
          status: resource.status,
          contentType: resource.contentType,
          body: resource.body,
        });
      } catch {
        if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => {});
      }
    });
    await page.goto(initial.url, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    await page.waitForFunction(() => (document.body?.innerText.trim().length ?? 0) >= 12, {
      timeout: Math.max(1, RENDER_TIMEOUT_MS - 2_000),
    });
    const text = (await page.evaluate(() => document.body.innerText)).trim();
    if (renderSignal.aborted) throw renderSignal.reason;
    return { url: initial.url, text };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof SourceReadError) throw error;
    throw new SourceReadError("браузер не смог прочитать текст за отведённое время");
  } finally {
    await browser?.close().catch(() => {});
    releaseBrowser();
  }
}

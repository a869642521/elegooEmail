import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const dataPath = path.join(root, "data", "cases.json");
const thumbnailDir = path.join(root, "public", "captures", "thumbnails");
const thumbnailPublicBase = "/captures/thumbnails";
const outputWidth = 520;
const cardRatio = 470 / 236;
const outputHeight = Math.round(outputWidth * cardRatio);

function inferEmailCanvasWidth(html) {
  const widths = Array.from(html.matchAll(/(?:width\s*=\s*["']?(\d{2,4})|width\s*:\s*(\d{2,4})px)/gi))
    .map((match) => Number(match[1] ?? match[2]))
    .filter((width) => width >= 320 && width <= 1200);

  return Math.max(600, ...widths);
}

function htmlDocument(capturedHtml, canvasWidth) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        width: ${canvasWidth}px;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: #fff;
      }

      img {
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>${capturedHtml}</body>
</html>`;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    try {
      return await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      throw error;
    }
  }
}

async function waitForEmailAssets(page) {
  await page.evaluate(async () => {
    if ("fonts" in document) {
      await document.fonts.ready;
    }

    await Promise.all(
      Array.from(document.images).map((image) => {
        if (image.complete) {
          return undefined;
        }

        return new Promise((resolve) => {
          image.onload = resolve;
          image.onerror = resolve;
        });
      })
    );
  });
  await page.waitForTimeout(250);
}

async function renderThumbnail(browser, item) {
  const capturedHtml = item.meta?.capturedHtml?.trim();
  const canvasWidth = inferEmailCanvasWidth(capturedHtml);
  const captureHeight = Math.round(canvasWidth * cardRatio);
  const page = await browser.newPage({
    viewport: {
      width: canvasWidth,
      height: captureHeight
    },
    deviceScaleFactor: 1
  });

  try {
    await page.setContent(htmlDocument(capturedHtml, canvasWidth), {
      waitUntil: "networkidle",
      timeout: 45_000
    });
    await waitForEmailAssets(page);

    const screenshot = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: captureHeight
      }
    });
    const fileName = `${item.slug}.webp`;
    const filePath = path.join(thumbnailDir, fileName);

    await sharp(screenshot)
      .resize(outputWidth, outputHeight, {
        fit: "cover",
        position: "top"
      })
      .webp({ quality: 88 })
      .toFile(filePath);

    return {
      publicPath: `${thumbnailPublicBase}/${fileName}`,
      sourceWidth: canvasWidth
    };
  } finally {
    await page.close();
  }
}

const store = JSON.parse(await readFile(dataPath, "utf8"));
const cases = Array.isArray(store) ? store : store.cases ?? [];
const targets = cases.filter(
  (item) => item.type === "email" && item.brandName?.toLowerCase() === "apple" && item.meta?.capturedHtml?.trim()
);

await mkdir(thumbnailDir, { recursive: true });

const browser = await launchBrowser();
let success = 0;
let failed = 0;

try {
  for (const item of targets) {
    try {
      const generated = await renderThumbnail(browser, item);
      const metaWithoutError = { ...(item.meta ?? {}) };
      delete metaWithoutError.thumbnailError;

      item.screenshotUrl = generated.publicPath;
      item.meta = {
        ...metaWithoutError,
        thumbnailGeneratedAt: new Date().toISOString(),
        thumbnailKind: "apple-html-card",
        thumbnailSourceWidth: String(generated.sourceWidth)
      };
      item.updatedAt = new Date().toISOString();
      success += 1;
      console.log(`ok ${success}/${targets.length}: ${item.title}`);
    } catch (error) {
      item.meta = {
        ...(item.meta ?? {}),
        thumbnailError: error instanceof Error ? error.message : "Unable to generate Apple thumbnail."
      };
      item.updatedAt = new Date().toISOString();
      failed += 1;
      console.log(`fail: ${item.title} - ${item.meta.thumbnailError}`);
    }
  }
} finally {
  await browser.close();
}

await writeFile(dataPath, `${JSON.stringify(store, null, 2)}\n`);
console.log(JSON.stringify({ total: targets.length, success, failed }, null, 2));

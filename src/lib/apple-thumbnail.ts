import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import { updateCase } from "@/lib/repository";
import type { CaseItem } from "@/types/case";

const thumbnailDir = path.join(process.cwd(), "public", "captures", "thumbnails");
const thumbnailPublicBase = "/captures/thumbnails";
const outputWidth = 520;
const cardRatio = 470 / 236;
const outputHeight = Math.round(outputWidth * cardRatio);

function isAppleEmailWithHtml(item: CaseItem) {
  return item.type === "email" && item.brandName.toLowerCase() === "apple" && Boolean(item.meta.capturedHtml?.trim());
}

function inferEmailCanvasWidth(html: string) {
  const widths = Array.from(html.matchAll(/(?:width\s*=\s*["']?(\d{2,4})|width\s*:\s*(\d{2,4})px)/gi))
    .map((match) => Number(match[1] ?? match[2]))
    .filter((width) => width >= 320 && width <= 1200);

  return Math.max(600, ...widths);
}

function htmlDocument(capturedHtml: string, canvasWidth: number) {
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

async function waitForEmailAssets(page: Awaited<ReturnType<Browser["newPage"]>>) {
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

export async function generateAppleThumbnailAsset(item: CaseItem, browser?: Browser) {
  const capturedHtml = item.meta.capturedHtml?.trim();

  if (!isAppleEmailWithHtml(item) || !capturedHtml) {
    return null;
  }

  const canvasWidth = inferEmailCanvasWidth(capturedHtml);
  const captureHeight = Math.round(canvasWidth * cardRatio);
  const ownsBrowser = !browser;
  const activeBrowser = browser ?? (await launchBrowser());
  const page = await activeBrowser.newPage({
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

    await mkdir(thumbnailDir, { recursive: true });
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

    if (ownsBrowser) {
      await activeBrowser.close();
    }
  }
}

export async function maybeGenerateAppleThumbnail(item: CaseItem) {
  if (!isAppleEmailWithHtml(item)) {
    return item;
  }

  const metaWithoutError = { ...item.meta };
  delete metaWithoutError.thumbnailError;

  try {
    const generated = await generateAppleThumbnailAsset(item);

    if (!generated) {
      return item;
    }

    return (
      (await updateCase(item.id, {
        screenshotUrl: generated.publicPath,
        meta: {
          ...metaWithoutError,
          thumbnailGeneratedAt: new Date().toISOString(),
          thumbnailKind: "apple-html-card",
          thumbnailSourceWidth: String(generated.sourceWidth)
        }
      })) ?? item
    );
  } catch (error) {
    return (
      (await updateCase(item.id, {
        meta: {
          ...item.meta,
          thumbnailError: error instanceof Error ? error.message : "Unable to generate Apple thumbnail."
        }
      })) ?? item
    );
  }
}

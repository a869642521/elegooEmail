import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { z } from "zod";

const importSchema = z.object({
  url: z.string().url(),
  skipFetch: z.boolean().optional()
});

const browserCaptureSchema = z.object({
  sourceUrl: z.string().url(),
  title: z.string().optional(),
  brandName: z.string().optional(),
  fromName: z.string().optional(),
  subject: z.string().optional(),
  previewText: z.string().optional(),
  coverImageUrl: z.string().url().optional().nullable(),
  screenshotDataUrl: z.string().startsWith("data:image/").optional().nullable(),
  imageUrls: z.array(z.string().url()).optional(),
  capturedHtml: z.string().optional(),
  capturedText: z.string().optional()
});

type ImportedCaseDraft = {
  type?: "email" | "website" | "product_page";
  title: string;
  sourceUrl: string;
  brandName: string;
  summary: string;
  coverImageUrl?: string | null;
  screenshotUrl?: string | null;
  industry?: string | null;
  notes?: string | null;
  importWarning?: string | null;
  meta?: Record<string, string>;
};

type EmailInspireActionEmail = {
  id?: number | string;
  subject?: string;
  imgSrc?: string;
  received?: Date | string | null;
  receivedAt?: Date | string | null;
  slug?: string;
};

type EmailInspireActionBrand = {
  name?: string;
  slug?: string;
  logo?: string;
};

type EmailInspireActionItem = {
  email?: EmailInspireActionEmail;
  brand?: EmailInspireActionBrand;
};

type EmailInspireActionResult = {
  data?: EmailInspireActionItem[];
  totalHits?: number;
  isLimited?: boolean;
};

type EmailInspireBrandPageProps = {
  dehydratedState?: {
    queries?: Array<{
      state?: {
        data?: {
          pages?: Array<{
            items?: EmailInspireActionItem[];
          }>;
        };
      };
    }>;
  };
};

function pickMeta($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = $(selector).attr("content") || $(selector).text();

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function cleanText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function resolveUrl(value: string | undefined, sourceUrl: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return null;
  }
}

function normalizePreviewImage(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.pathname.includes("/preview-images/")) {
      url.searchParams.set("quality", "90");
      url.searchParams.set("width", "1200");
      url.searchParams.set("height", "2400");
      url.searchParams.set("aspect_ratio", "1200:2400");
    }

    return url.toString();
  } catch {
    return value;
  }
}

function fetchHeaders() {
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "cache-control": "no-cache",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
  };
}

function fetchJsonHeaders() {
  return {
    accept: "application/json",
    "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "content-type": "application/json",
    "cache-control": "no-cache",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
  };
}

function largestSrcFromSrcset(srcset?: string | null) {
  if (!srcset) {
    return null;
  }

  const candidates = srcset
    .split(",")
    .map((candidate) => {
      const [src, width] = candidate.trim().split(/\s+/);
      return { src, width: Number(width?.replace("w", "")) || 0 };
    })
    .filter((candidate) => candidate.src)
    .sort((a, b) => b.width - a.width);

  return candidates[0]?.src ?? null;
}

function imageFromElement(element: cheerio.Cheerio<AnyNode>, sourceUrl: string) {
  return resolveUrl(largestSrcFromSrcset(element.attr("srcset")) ?? element.attr("src"), sourceUrl);
}

function guessBrand(hostname: string) {
  const parts = hostname.replace(/^www\./, "").split(".");
  return parts[0]
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function screenshotFor(url: string) {
  return `https://image.thum.io/get/width/1200/crop/900/noanimate/${encodeURIComponent(url)}`;
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function inferCaseFromUrl(url: string) {
  const target = new URL(url);
  const path = target.pathname.replace(/^\/|\/$/g, "");
  const emailLoveMatch = path.match(/^email-inspiration-from-([a-z0-9-]+?)(?:-\d+)?$/i);

  if (target.hostname.includes("emaillove.com") && emailLoveMatch) {
    const brandName = titleCase(emailLoveMatch[1]);

    return {
      type: "email" as const,
      title: `${brandName} email inspiration`,
      brandName,
      summary:
        "Imported as an EDM draft from Email Love. The source blocked metadata fetching, so refine the cover, subject line, CTA, and notes manually."
    };
  }

  return null;
}

function inferBrandFromTitle(title: string) {
  const match = title.match(/Email Inspiration from\s+(.+)$/i);
  return match?.[1]?.trim();
}

function fallbackImport(url: string, reason: string) {
  const target = new URL(url);
  const inferred = inferCaseFromUrl(url);
  const brandName = inferred?.brandName ?? guessBrand(target.hostname);

  return {
    type: inferred?.type,
    title: inferred?.title ?? `${brandName} reference`,
    sourceUrl: url,
    brandName,
    summary:
      inferred?.summary ??
      "Imported as a draft. The source blocked metadata fetching, so add editorial notes and a cover image manually.",
    coverImageUrl: null,
    screenshotUrl: screenshotFor(url),
    importWarning: reason,
    meta: {
      importedHost: target.hostname,
      importer: "fallback-url",
      importWarning: reason
    }
  };
}

function extractSection(text: string, start: string, end?: string) {
  const startIndex = text.indexOf(start);

  if (startIndex === -1) {
    return "";
  }

  const fromStart = text.slice(startIndex + start.length);
  const endIndex = end ? fromStart.indexOf(end) : -1;
  return cleanText(endIndex === -1 ? fromStart : fromStart.slice(0, endIndex));
}

function normalizeEmailInspireTitle(value: string) {
  return cleanText(value.replace(/\s*\|\s*Email Inspire$/i, "").replace(/^.+?:\s*/, ""));
}

function emailInspireCaseFromCard($: cheerio.CheerioAPI, card: AnyNode, sourceUrl: string): ImportedCaseDraft | null {
  const $card = $(card);
  const href = $card
    .find('a[href^="/"]')
    .toArray()
    .map((link) => $(link).attr("href") ?? "")
    .find((value) => value.split("/").filter(Boolean).length >= 2);

  if (!href) {
    return null;
  }

  const detailUrl = new URL(href, sourceUrl).toString();
  const detailPath = new URL(detailUrl).pathname.split("/").filter(Boolean);
  const brandName = titleCase(detailPath[0] ?? "Email Inspire");
  const title = cleanText($card.find(".line-clamp-3").last().text()) || normalizeEmailInspireTitle($card.find("img").first().attr("alt") ?? "");
  const date = cleanText($card.text()).match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0] ?? "";
  const coverImageUrl = imageFromElement($card.find("img").first(), sourceUrl);

  if (!title) {
    return null;
  }

  return {
    type: "email",
    title,
    sourceUrl: detailUrl,
    brandName,
    industry: "Consumer Electronics",
    summary: `Subject: ${title}${date ? ` · Email Inspire result from ${date}` : ""}.`,
    coverImageUrl,
    screenshotUrl: screenshotFor(detailUrl),
    notes: [`BRAND: ${brandName}`, date ? `DATE: ${date}` : "", `SOURCE: ${detailUrl}`].filter(Boolean).join("\n"),
    importWarning: null,
    meta: {
      importedHost: new URL(detailUrl).hostname,
      importer: "emailinspire-list",
      subject: title,
      receivedAt: date,
      imageUrls: coverImageUrl ?? ""
    }
  };
}

function importEmailInspireList(url: string, html: string): ImportedCaseDraft[] {
  const $ = cheerio.load(html);
  const items = $(".email-card")
    .toArray()
    .map((card) => emailInspireCaseFromCard($, card, url))
    .filter((item): item is ImportedCaseDraft => Boolean(item));

  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.sourceUrl)) {
      return false;
    }

    seen.add(item.sourceUrl);
    return true;
  });
}

function reviveEmailInspireAction(value: unknown, table: unknown[], seen = new Map<number, unknown>()): unknown {
  if (typeof value === "number") {
    if (seen.has(value)) {
      return seen.get(value);
    }

    return reviveEmailInspireAction(table[value], table, seen);
  }

  if (Array.isArray(value)) {
    if (value[0] === "Date" && typeof value[1] === "string") {
      return new Date(value[1]);
    }

    return value.map((item) => reviveEmailInspireAction(item, table, seen));
  }

  if (value && typeof value === "object") {
    const revived: Record<string, unknown> = {};
    const index = table.indexOf(value);

    if (index !== -1) {
      seen.set(index, revived);
    }

    for (const [key, item] of Object.entries(value)) {
      revived[key] = reviveEmailInspireAction(item, table, seen);
    }

    return revived;
  }

  return value;
}

function reviveEmailInspireAstroValue(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number") {
    const [type, item] = value;

    if (type === 1 && Array.isArray(item)) {
      return item.map(reviveEmailInspireAstroValue);
    }

    if (type === 3 && typeof item === "string") {
      return new Date(item);
    }

    return reviveEmailInspireAstroValue(item);
  }

  if (Array.isArray(value)) {
    return value.map(reviveEmailInspireAstroValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveEmailInspireAstroValue(item)]));
  }

  return value;
}

function receivedDateLabel(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  return date.toISOString().slice(0, 10);
}

function emailInspireImageUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const imageUrl = new URL(value);

    if (!imageUrl.search) {
      imageUrl.searchParams.set("quality", "80");
      imageUrl.searchParams.set("width", "900");
      imageUrl.searchParams.set("height", "1800");
      imageUrl.searchParams.set("aspect_ratio", "900:1800");
    }

    return imageUrl.toString();
  } catch {
    return null;
  }
}

function emailInspireCaseFromActionItem(item: EmailInspireActionItem): ImportedCaseDraft | null {
  const subject = cleanText(item.email?.subject);
  const brandName = cleanText(item.brand?.name) || "Email Inspire";
  const brandSlug = cleanText(item.brand?.slug);
  const emailSlug = cleanText(item.email?.slug);

  if (!subject || !brandSlug || !emailSlug) {
    return null;
  }

  const sourceUrl = `https://www.emailinspire.com/${brandSlug}/${emailSlug}`;
  const receivedAt = receivedDateLabel(item.email?.receivedAt ?? item.email?.received);
  const coverImageUrl = emailInspireImageUrl(item.email?.imgSrc);

  return {
    type: "email",
    title: subject,
    sourceUrl,
    brandName,
    industry: "Consumer Electronics",
    summary: `Subject: ${subject}${receivedAt ? ` · Email Inspire result from ${receivedAt}` : ""}.`,
    coverImageUrl,
    screenshotUrl: screenshotFor(sourceUrl),
    notes: [`BRAND: ${brandName}`, receivedAt ? `RECEIVED AT: ${receivedAt}` : "", `SUBJECT: ${subject}`, `SOURCE: ${sourceUrl}`]
      .filter(Boolean)
      .join("\n"),
    importWarning: null,
    meta: {
      importedHost: "www.emailinspire.com",
      importer: "emailinspire-action",
      emailId: String(item.email?.id ?? ""),
      subject,
      receivedAt,
      imageUrls: coverImageUrl ?? ""
    }
  };
}

async function fetchEmailInspireCapturedHtml(sourceUrl: string) {
  try {
    const response = await fetch(sourceUrl, {
      headers: fetchHeaders(),
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const emailContent = $("#email-content").first();

    if (!emailContent.length) {
      return null;
    }

    return {
      emailId: emailContent.attr("data-email-id") ?? "",
      capturedHtml: $.html(emailContent),
      capturedText: cleanText(emailContent.text()).slice(0, 12000)
    };
  } catch {
    return null;
  }
}

async function hydrateEmailInspireCases(items: ImportedCaseDraft[]) {
  const hydrated: ImportedCaseDraft[] = [];
  const concurrency = 4;

  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (item) => {
        const capture = await fetchEmailInspireCapturedHtml(item.sourceUrl);

        if (!capture?.capturedHtml) {
          return item;
        }

        return {
          ...item,
          meta: {
            ...(item.meta ?? {}),
            importer: `${item.meta?.importer ?? "emailinspire"}+html`,
            emailId: item.meta?.emailId || capture.emailId,
            capturedHtml: capture.capturedHtml.slice(0, 900000),
            capturedText: capture.capturedText
          }
        };
      })
    );

    hydrated.push(...results);
  }

  return hydrated;
}

async function importEmailInspireSearch(url: string): Promise<ImportedCaseDraft[]> {
  const target = new URL(url);
  const response = await fetch("https://www.emailinspire.com/_actions/meilisearchEmails", {
    method: "POST",
    headers: fetchJsonHeaders(),
    body: JSON.stringify({
      q: target.searchParams.get("q") ?? "",
      subjectMin: null,
      subjectMax: null,
      hasEmojis: null,
      imgMin: null,
      imgMax: null,
      gifMin: null,
      gifMax: null,
      from: null,
      to: null,
      brands: [],
      offset: 0,
      pageSize: 8
    }),
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    return [];
  }

  const serialized = await response.json();

  if (!Array.isArray(serialized)) {
    return [];
  }

  const root = reviveEmailInspireAction(serialized[0], serialized) as EmailInspireActionResult;
  const items = Array.isArray(root.data) ? root.data : [];
  const seen = new Set<string>();

  const drafts = items
    .map(emailInspireCaseFromActionItem)
    .filter((item): item is ImportedCaseDraft => Boolean(item))
    .filter((item) => {
      if (seen.has(item.sourceUrl)) {
        return false;
      }

      seen.add(item.sourceUrl);
      return true;
    });

  return hydrateEmailInspireCases(drafts);
}

function importEmailInspireBrandPage(url: string, html: string): ImportedCaseDraft[] {
  const $ = cheerio.load(html);
  const props = $('astro-island[component-url*="BrandPageTabs"]').attr("props");

  if (!props) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(props);
  } catch {
    return [];
  }

  const revived = reviveEmailInspireAstroValue(parsed) as EmailInspireBrandPageProps;
  const items =
    revived.dehydratedState?.queries?.flatMap((query) =>
      query.state?.data?.pages?.flatMap((page) => (Array.isArray(page.items) ? page.items : [])) ?? []
    ) ?? [];
  const seen = new Set<string>();

  return items
    .map(emailInspireCaseFromActionItem)
    .filter((item): item is ImportedCaseDraft => Boolean(item))
    .filter((item) => {
      if (seen.has(item.sourceUrl)) {
        return false;
      }

      seen.add(item.sourceUrl);
      return true;
    });
}

function importEmailInspireDetail(url: string, html: string): ImportedCaseDraft {
  const $ = cheerio.load(html);
  const title = normalizeEmailInspireTitle(pickMeta($, ['meta[property="og:title"]', 'meta[name="twitter:title"]', "title"]));
  const text = cleanText($("body").text());
  const brandName = cleanText($('a[href^="/"]').filter((_, link) => $(link).attr("href") === `/${new URL(url).pathname.split("/").filter(Boolean)[0]}`).first().text()) || titleCase(new URL(url).pathname.split("/").filter(Boolean)[0] ?? "Email Inspire");
  const subject = extractSection(text, "SUBJECT", "PREVIEW TEXT") || title;
  const previewText = extractSection(text, "PREVIEW TEXT", "RECEIVED AT");
  const receivedAt = extractSection(text, "RECEIVED AT", "FROM");
  const fromName = extractSection(text, "FROM", "EMAIL PLATFORM");
  const previewImages = $('img[src*="preview-images"], img[srcset*="preview-images"]')
    .toArray()
    .map((image) => imageFromElement($(image), url))
    .filter((image): image is string => Boolean(image));
  const slugHint = new URL(url).pathname.split("/").pop()?.slice(0, 24).toLowerCase() ?? "";
  const matchingImage = previewImages.find((image) => image.toLowerCase().includes(slugHint)) ?? previewImages[0] ?? null;
  const emailContent = $("#email-content").first();
  const capturedHtml = emailContent.length ? $.html(emailContent) : "";
  const capturedText = emailContent.length ? cleanText(emailContent.text()).slice(0, 12000) : "";

  return {
    type: "email",
    title: subject,
    sourceUrl: url,
    brandName,
    industry: "Consumer Electronics",
    summary: [subject ? `Subject: ${subject}` : "", previewText].filter(Boolean).join(" · ") || "Email Inspire EDM reference imported from public page metadata.",
    coverImageUrl: matchingImage,
    screenshotUrl: screenshotFor(url),
    notes: [`FROM: ${fromName || brandName}`, `SUBJECT: ${subject}`, previewText ? `PREVIEW: ${previewText}` : "", receivedAt ? `RECEIVED AT: ${receivedAt}` : "", `SOURCE: ${url}`]
      .filter(Boolean)
      .join("\n"),
    importWarning: null,
    meta: {
      importedHost: new URL(url).hostname,
      importer: "emailinspire-detail",
      fromName,
      subject,
      previewText,
      receivedAt,
      imageUrls: Array.from(new Set(previewImages)).join("\n"),
      emailId: emailContent.attr("data-email-id") ?? "",
      capturedHtml: capturedHtml.slice(0, 900000),
      capturedText
    }
  };
}

export function importBrowserCapture(input: unknown) {
  const capture = browserCaptureSchema.parse(input);
  const inferred = inferCaseFromUrl(capture.sourceUrl);
  const title = capture.title?.trim() || inferred?.title || `${guessBrand(new URL(capture.sourceUrl).hostname)} reference`;
  const brandName = capture.brandName?.trim() || inferBrandFromTitle(title) || inferred?.brandName || guessBrand(new URL(capture.sourceUrl).hostname);
  const subject = capture.subject?.trim();
  const fromName = capture.fromName?.trim();
  const imageUrls = capture.imageUrls?.slice(0, 80) ?? [];
  const coverImageUrl = normalizePreviewImage(capture.coverImageUrl ?? imageUrls[0]);

  return {
    type: inferred?.type ?? ("email" as const),
    title,
    sourceUrl: capture.sourceUrl,
    brandName,
    summary:
      subject || capture.previewText
        ? [subject ? `Subject: ${subject}` : "", capture.previewText ?? ""].filter(Boolean).join(" · ")
        : "Captured from the open browser page. Review the email details and add editorial notes before publishing.",
    coverImageUrl,
    screenshotUrl: capture.screenshotDataUrl ?? screenshotFor(capture.sourceUrl),
    notes: capture.capturedText?.slice(0, 2400) ?? "",
    importWarning: null,
    meta: {
      importedHost: new URL(capture.sourceUrl).hostname,
      importer: "browser-capture",
      fromName: fromName ?? "",
      subject: subject ?? "",
      imageUrls: imageUrls.join("\n"),
      capturedHtml: capture.capturedHtml?.slice(0, 900000) ?? "",
      capturedText: capture.capturedText?.slice(0, 12000) ?? ""
    }
  };
}

export async function importUrl(input: unknown): Promise<ImportedCaseDraft | ImportedCaseDraft[]> {
  const { url, skipFetch } = importSchema.parse(input);
  const target = new URL(url);

  if (skipFetch) {
    return fallbackImport(url, "Metadata fetch skipped by admin.");
  }

  if (target.hostname.includes("emailinspire.com") && target.pathname === "/emails") {
    try {
      const items = await importEmailInspireSearch(url);

      if (items.length) {
        return items;
      }
    } catch {
      // Fall through to static HTML parsing if the action endpoint changes.
    }
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: fetchHeaders(),
      next: { revalidate: 0 }
    });
  } catch (error) {
    return fallbackImport(url, error instanceof Error ? error.message : "The source could not be reached.");
  }

  if (!response.ok) {
    return fallbackImport(url, `Remote server returned ${response.status}.`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  if (target.hostname.includes("emailinspire.com")) {
    if (target.pathname === "/emails") {
      const items = importEmailInspireList(url, html);

      if (items.length) {
        return items.slice(0, 8);
      }
    }

    if (target.pathname.split("/").filter(Boolean).length === 1) {
      const items = importEmailInspireBrandPage(url, html);

      if (items.length) {
        return hydrateEmailInspireCases(items);
      }
    }

    return importEmailInspireDetail(url, html);
  }

  const title =
    pickMeta($, ['meta[property="og:title"]', 'meta[name="twitter:title"]', "title"]) ||
    `${guessBrand(target.hostname)} reference`;

  const summary =
    pickMeta($, ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]']) ||
    "Imported reference awaiting editorial notes.";

  const coverImageUrl = resolveUrl(
    pickMeta($, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) || $("img").first().attr("src"),
    url
  );

  return {
    title,
    sourceUrl: url,
    brandName: pickMeta($, ['meta[property="og:site_name"]']) || guessBrand(target.hostname),
    summary,
    coverImageUrl,
    screenshotUrl: screenshotFor(url),
    importWarning: null,
    meta: {
      importedHost: target.hostname,
      importer: "html-metadata"
    }
  };
}

import * as cheerio from "cheerio";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createCaseDraft, findCaseBySourceUrl } from "@/lib/repository";

type EmailImportConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  allowedSenders: string[];
  subjectKeywords: string[];
};

type ImportedEmailResult = {
  imported: number;
  skipped: number;
  cases: Array<{ id: string; title: string; brandName: string; status: string }>;
};

function getConfig(): EmailImportConfig {
  const host = process.env.EMAIL_IMPORT_HOST;
  const port = Number(process.env.EMAIL_IMPORT_PORT || "993");
  const user = process.env.EMAIL_IMPORT_USER;
  const password = process.env.EMAIL_IMPORT_PASSWORD;
  const mailbox = process.env.EMAIL_IMPORT_MAILBOX || "INBOX";
  const allowedSenders = splitEnvList(process.env.EMAIL_IMPORT_ALLOWED_SENDERS);
  const subjectKeywords = splitEnvList(process.env.EMAIL_IMPORT_SUBJECT_KEYWORDS);

  if (!host || !user || !password) {
    throw new Error("Missing EMAIL_IMPORT_HOST, EMAIL_IMPORT_USER, or EMAIL_IMPORT_PASSWORD in .env.local.");
  }

  return { host, port, user, password, mailbox, allowedSenders, subjectKeywords };
}

function splitEnvList(value?: string) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function cleanText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stripQuotedForward(value: string) {
  return value.split(/On .+ wrote:|发件人：|From:/i)[0]?.trim() || value;
}

function summarize(text: string, fallback: string) {
  const clean = cleanText(stripQuotedForward(text));
  return clean ? clean.slice(0, 180) : fallback;
}

function titleCase(value: string) {
  return value
    .split(/[-_.\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function brandFromAddress(address?: string | null) {
  if (!address) {
    return "";
  }

  const domain = address.split("@")[1]?.toLowerCase().replace(/^mail\.|^news\.|^newsletter\./, "");
  const base = domain?.split(".")[0];
  return base ? titleCase(base) : "";
}

function firstAddress(value: unknown) {
  const addresses = value as { value?: Array<{ address?: string; name?: string }> } | undefined;
  return addresses?.value?.[0] ?? null;
}

function extractImages(html: string) {
  const $ = cheerio.load(html);
  const images = new Set<string>();

  $("img").each((_, element) => {
    const src = $(element).attr("src")?.trim();

    if (src && /^https?:\/\//i.test(src)) {
      images.add(src);
    }
  });

  return Array.from(images);
}

function previewTextFromHtml(html: string) {
  const $ = cheerio.load(html);
  const hiddenPreview = cleanText($("div[style*='display:none'], span[style*='display:none']").first().text());

  if (hiddenPreview) {
    return hiddenPreview.slice(0, 180);
  }

  return cleanText($.text()).slice(0, 180);
}

function matchesAllowedSender(fromEmail: string, allowedSenders: string[]) {
  if (!allowedSenders.length) {
    return true;
  }

  const normalized = fromEmail.toLowerCase();
  const domain = normalized.split("@")[1] || "";

  return allowedSenders.some((sender) => normalized === sender || domain === sender || domain.endsWith(`.${sender}`));
}

function matchesSubjectKeyword(subject: string, keywords: string[]) {
  if (!keywords.length) {
    return true;
  }

  const normalized = subject.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

export async function pollEmailInbox(limit = 10): Promise<ImportedEmailResult> {
  const config = getConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: {
      user: config.user,
      pass: config.password
    },
    logger: false
  });
  const result: ImportedEmailResult = { imported: 0, skipped: 0, cases: [] };

  await client.connect();

  try {
    const lock = await client.getMailboxLock(config.mailbox);

    try {
      const messages = [];

      for await (const message of client.fetch({ seen: false }, { envelope: true, source: true, uid: true }, { uid: false })) {
        messages.push(message);

        if (messages.length >= limit) {
          break;
        }
      }

      for (const message of messages) {
        if (!message.source) {
          result.skipped += 1;
          continue;
        }

        const parsed = await simpleParser(message.source);
        const messageId = parsed.messageId || `${config.user}-${message.uid}`;
        const sourceUrl = `gmail-message://${encodeURIComponent(messageId)}`;
        const existing = await findCaseBySourceUrl(sourceUrl);

        if (existing) {
          result.skipped += 1;
          continue;
        }

        const from = firstAddress(parsed.from);
        const fromName = cleanText(from?.name);
        const fromEmail = cleanText(from?.address);
        const subject = cleanText(parsed.subject) || "未命名邮件";

        if (!matchesAllowedSender(fromEmail, config.allowedSenders) || !matchesSubjectKeyword(subject, config.subjectKeywords)) {
          result.skipped += 1;
          continue;
        }

        const html = parsed.html || "";
        const text = parsed.text || "";
        const imageUrls = html ? extractImages(html) : [];
        const previewText = text ? summarize(text, subject) : previewTextFromHtml(html);
        const brandName = fromName || brandFromAddress(fromEmail) || "Unknown Brand";
        const item = await createCaseDraft({
          type: "email",
          title: subject,
          sourceUrl,
          brandName,
          industry: null,
          summary: previewText || `来自 ${brandName} 的邮件案例。`,
          coverImageUrl: imageUrls[0] ?? null,
          screenshotUrl: null,
          notes: `自动从 Gmail IMAP 导入。\nFROM: ${fromName || brandName}${fromEmail ? ` <${fromEmail}>` : ""}\nSUBJECT: ${subject}`,
          meta: {
            importer: "gmail-imap",
            messageId,
            mailboxUid: String(message.uid),
            fromName: fromName || brandName,
            fromEmail,
            subject,
            preview: previewText,
            receivedAt: parsed.date?.toISOString() ?? "",
            capturedHtml: html,
            capturedText: text,
            imageUrls: imageUrls.join("\n")
          }
        });

        result.imported += 1;
        result.cases.push({
          id: item.id,
          title: item.title,
          brandName: item.brandName,
          status: item.status
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return result;
}

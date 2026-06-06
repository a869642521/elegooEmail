import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export function absoluteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return new URL(path, base).toString();
}

export function parseDateish(date: string | Date) {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const value = date.trim();
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(date: string | Date) {
  const parsed = parseDateish(date);

  if (!parsed) {
    return typeof date === "string" ? date : "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(parsed);
}

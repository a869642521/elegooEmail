import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { seedCases } from "@/lib/seed-data";
import { slugify } from "@/lib/utils";
import type { CaseFilters, CaseItem, CaseStatus, CaseTag, CaseType } from "@/types/case";

const localStorePath = path.join(process.cwd(), "data", "cases.json");
const seedIds = new Set(seedCases.map((item) => item.id));

type CaseRecord = Omit<CaseItem, "createdAt" | "updatedAt" | "meta" | "tags"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
  meta: unknown;
  tags?: Array<CaseTag | { tag: CaseTag }>;
};

type LocalCaseStore = {
  cases: CaseItem[];
  deletedSeedIds: string[];
};

function canUseDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

async function readLocalStore(): Promise<LocalCaseStore> {
  try {
    const file = await readFile(localStorePath, "utf8");
    const parsed = JSON.parse(file) as CaseItem[] | Partial<LocalCaseStore>;

    if (Array.isArray(parsed)) {
      return { cases: parsed, deletedSeedIds: [] };
    }

    return {
      cases: parsed.cases ?? [],
      deletedSeedIds: parsed.deletedSeedIds ?? []
    };
  } catch {
    return { cases: [], deletedSeedIds: [] };
  }
}

async function loadLocalCases() {
  const store = await readLocalStore();
  const deletedSeedIds = new Set(store.deletedSeedIds);
  const activeSeeds = seedCases.filter((item) => !deletedSeedIds.has(item.id));

  return new Map([...activeSeeds, ...store.cases].map((item) => [item.id, item]));
}

async function saveLocalCases(cases: Map<string, CaseItem>, deletedSeedIds: string[] = []) {
  await mkdir(path.dirname(localStorePath), { recursive: true });
  const persisted = Array.from(cases.values()).filter((item) => !seedIds.has(item.id));

  await writeFile(localStorePath, JSON.stringify({ cases: persisted, deletedSeedIds }, null, 2));
}

function normalizeMeta(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? "")])
  );
}

function hasNestedTag(value: CaseTag | { tag: CaseTag }): value is { tag: CaseTag } {
  return "tag" in value;
}

function toCaseItem(item: CaseRecord): CaseItem {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    sourceUrl: item.sourceUrl,
    brandName: item.brandName,
    industry: item.industry,
    summary: item.summary,
    coverImageUrl: item.coverImageUrl,
    screenshotUrl: item.screenshotUrl,
    status: item.status,
    notes: item.notes,
    meta: normalizeMeta(item.meta),
    tags: item.tags?.map((caseTag) => (hasNestedTag(caseTag) ? caseTag.tag : caseTag)) ?? [],
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString()
  };
}

function filterCases(items: CaseItem[], filters: CaseFilters = {}) {
  const keyword = filters.keyword?.trim().toLowerCase();
  const tag = filters.tag?.trim().toLowerCase();
  const brand = filters.brand?.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.type && filters.type !== "all" && item.type !== filters.type) {
      return false;
    }

    if (filters.status && filters.status !== "all" && item.status !== filters.status) {
      return false;
    }

    if (tag && !item.tags.some((caseTag) => caseTag.name.toLowerCase() === tag)) {
      return false;
    }

    if (brand && item.brandName.toLowerCase() !== brand) {
      return false;
    }

    if (keyword) {
      const haystack = [item.title, item.brandName, item.industry, item.summary, item.notes, ...item.tags.map((t) => t.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    return true;
  });
}

export async function listCases(filters: CaseFilters = {}): Promise<CaseItem[]> {
  if (!canUseDatabase()) {
    const cases = await loadLocalCases();
    return filterCases(Array.from(cases.values()), filters).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }

  const cases = await prisma.case.findMany({
    where: {
      type: filters.type && filters.type !== "all" ? filters.type : undefined,
      status: filters.status && filters.status !== "all" ? filters.status : undefined,
      brandName: filters.brand ? { equals: filters.brand, mode: "insensitive" } : undefined,
      tags: filters.tag
        ? {
            some: {
              tag: {
                name: { equals: filters.tag, mode: "insensitive" }
              }
            }
          }
        : undefined,
      OR: filters.keyword
        ? [
            { title: { contains: filters.keyword, mode: "insensitive" } },
            { brandName: { contains: filters.keyword, mode: "insensitive" } },
            { summary: { contains: filters.keyword, mode: "insensitive" } },
            { notes: { contains: filters.keyword, mode: "insensitive" } }
          ]
        : undefined
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { updatedAt: "desc" }
  });

  return cases.map(toCaseItem);
}

export async function getCaseBySlug(slug: string): Promise<CaseItem | null> {
  if (!canUseDatabase()) {
    const cases = await loadLocalCases();
    return Array.from(cases.values()).find((item) => item.slug === slug) ?? null;
  }

  const item = await prisma.case.findUnique({
    where: { slug },
    include: { tags: { include: { tag: true } } }
  });

  return item ? toCaseItem(item) : null;
}

export async function getCaseById(id: string): Promise<CaseItem | null> {
  if (!canUseDatabase()) {
    const cases = await loadLocalCases();
    return cases.get(id) ?? null;
  }

  const item = await prisma.case.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } }
  });

  return item ? toCaseItem(item) : null;
}

export async function findCaseBySourceUrl(sourceUrl: string): Promise<CaseItem | null> {
  if (!canUseDatabase()) {
    const cases = await loadLocalCases();
    return Array.from(cases.values()).find((item) => item.sourceUrl === sourceUrl) ?? null;
  }

  const item = await prisma.case.findUnique({
    where: { sourceUrl },
    include: { tags: { include: { tag: true } } }
  });

  return item ? toCaseItem(item) : null;
}

export async function createCaseDraft(input: {
  type?: CaseType;
  title: string;
  sourceUrl: string;
  brandName: string;
  summary: string;
  coverImageUrl?: string | null;
  screenshotUrl?: string | null;
  industry?: string | null;
  notes?: string | null;
  meta?: Record<string, string>;
}) {
  const existing = await findCaseBySourceUrl(input.sourceUrl);

  if (existing) {
    return existing;
  }

  const timestamp = new Date().toISOString();
  const slugBase = slugify(`${input.brandName}-${input.title}`) || slugify(input.sourceUrl);
  const slug = `${slugBase}-${Date.now().toString(36)}`;

  if (!canUseDatabase()) {
    const cases = await loadLocalCases();
    const item: CaseItem = {
      id: `case-${Date.now().toString(36)}`,
      type: input.type ?? "website",
      title: input.title,
      slug,
      sourceUrl: input.sourceUrl,
      brandName: input.brandName,
      industry: input.industry ?? null,
      summary: input.summary,
      coverImageUrl: input.coverImageUrl ?? null,
      screenshotUrl: input.screenshotUrl ?? null,
      status: "draft",
      notes: input.notes ?? "",
      meta: input.meta ?? {},
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    cases.set(item.id, item);
    await saveLocalCases(cases);
    return item;
  }

  const item = await prisma.case.create({
    data: {
      type: input.type ?? "website",
      title: input.title,
      slug,
      sourceUrl: input.sourceUrl,
      brandName: input.brandName,
      industry: input.industry,
      summary: input.summary,
      coverImageUrl: input.coverImageUrl,
      screenshotUrl: input.screenshotUrl,
      notes: input.notes,
      meta: input.meta ?? {}
    },
    include: { tags: { include: { tag: true } } }
  });

  return toCaseItem(item);
}

export async function updateCase(
  id: string,
  input: Partial<Pick<CaseItem, "type" | "title" | "brandName" | "industry" | "summary" | "coverImageUrl" | "screenshotUrl" | "notes" | "meta">>
) {
  if (!canUseDatabase()) {
    const cases = await loadLocalCases();
    const existing = cases.get(id);
    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString()
    };
    cases.set(id, updated);
    await saveLocalCases(cases);
    return updated;
  }

  const updated = await prisma.case.update({
    where: { id },
    data: input,
    include: { tags: { include: { tag: true } } }
  });

  return toCaseItem(updated);
}

export async function setCaseStatus(id: string, status: CaseStatus) {
  if (!canUseDatabase()) {
    const cases = await loadLocalCases();
    const existing = cases.get(id);
    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      status,
      updatedAt: new Date().toISOString()
    };
    cases.set(id, updated);
    await saveLocalCases(cases);
    return updated;
  }

  const updated = await prisma.case.update({
    where: { id },
    data: { status },
    include: { tags: { include: { tag: true } } }
  });

  return toCaseItem(updated);
}

export async function deleteCase(id: string) {
  if (!canUseDatabase()) {
    const store = await readLocalStore();
    const cases = await loadLocalCases();
    const existing = cases.get(id);

    if (!existing) {
      return null;
    }

    cases.delete(id);
    const deletedSeedIds = seedIds.has(id) ? Array.from(new Set([...store.deletedSeedIds, id])) : store.deletedSeedIds;
    await saveLocalCases(cases, deletedSeedIds);
    return existing;
  }

  const existing = await prisma.case.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } }
  });

  if (!existing) {
    return null;
  }

  await prisma.case.delete({ where: { id } });
  return toCaseItem(existing);
}

export async function listTagFacets() {
  const cases = await listCases({ status: "published" });
  const brands = Array.from(new Set(cases.map((item) => item.brandName))).sort();
  const tags = Array.from(new Map(cases.flatMap((item) => item.tags).map((tag) => [tag.name, tag])).values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return { brands, tags };
}

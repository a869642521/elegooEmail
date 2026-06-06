export type CaseType = "email" | "website" | "product_page";

export type CaseStatus = "draft" | "published" | "archived";

export type TagGroup = "style" | "industry" | "module" | "campaign" | "platform";

export type CaseTag = {
  id: string;
  name: string;
  group: TagGroup;
};

export type CaseItem = {
  id: string;
  type: CaseType;
  title: string;
  slug: string;
  sourceUrl: string;
  brandName: string;
  industry?: string | null;
  summary: string;
  coverImageUrl?: string | null;
  screenshotUrl?: string | null;
  status: CaseStatus;
  notes?: string | null;
  meta: Record<string, string>;
  tags: CaseTag[];
  createdAt: string;
  updatedAt: string;
};

export type CaseFilters = {
  type?: CaseType | "all";
  tag?: string;
  brand?: string;
  keyword?: string;
  status?: CaseStatus | "all";
};

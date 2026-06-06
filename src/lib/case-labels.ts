import type { CaseStatus, CaseType, TagGroup } from "@/types/case";

export const caseTypeLabels: Record<CaseType, string> = {
  email: "EDM",
  website: "WEB 官网",
  product_page: "详情页"
};

export const statusLabels: Record<CaseStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

export const tagGroupLabels: Record<TagGroup, string> = {
  style: "风格",
  industry: "行业",
  module: "模块",
  campaign: "营销",
  platform: "平台"
};

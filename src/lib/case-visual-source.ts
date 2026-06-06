import type { CaseItem } from "@/types/case";

function isCapturedScreenshot(value?: string | null) {
  if (!value) {
    return false;
  }

  return value.startsWith("data:image/") || value.startsWith("/captures/");
}

export function getCaseVisualSource(item: Pick<CaseItem, "coverImageUrl" | "screenshotUrl">) {
  if (isCapturedScreenshot(item.screenshotUrl)) {
    return item.screenshotUrl;
  }

  return item.coverImageUrl || item.screenshotUrl;
}

import { parseDateish } from "@/lib/utils";
import type { CaseItem } from "@/types/case";

export function getCaseReceivedAt(item: CaseItem) {
  return item.meta.receivedAt || item.meta.received || item.createdAt;
}

export function getCaseReceivedTime(item: CaseItem) {
  return parseDateish(getCaseReceivedAt(item))?.getTime() ?? parseDateish(item.createdAt)?.getTime() ?? 0;
}

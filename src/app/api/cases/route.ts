import { NextRequest, NextResponse } from "next/server";
import { listCases } from "@/lib/repository";
import type { CaseStatus, CaseType } from "@/types/case";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const cases = await listCases({
    type: (searchParams.get("type") as CaseType | "all" | null) ?? "all",
    status: (searchParams.get("status") as CaseStatus | "all" | null) ?? "published",
    tag: searchParams.get("tag") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    keyword: searchParams.get("keyword") ?? undefined
  });

  return NextResponse.json({ cases });
}

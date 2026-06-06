import { NextRequest, NextResponse } from "next/server";
import { maybeGenerateAppleThumbnail } from "@/lib/apple-thumbnail";
import { isAdminRequest } from "@/lib/auth";
import { importBrowserCapture } from "@/lib/importer";
import { createCaseDraft, findCaseBySourceUrl, updateCase } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const imported = importBrowserCapture(await request.json());
    const existing = await findCaseBySourceUrl(imported.sourceUrl);
    const item = existing ? await updateCase(existing.id, imported) : await createCaseDraft(imported);
    const withThumbnail = item ? await maybeGenerateAppleThumbnail(item) : item;

    return NextResponse.json({
      caseId: withThumbnail?.id,
      status: withThumbnail?.status,
      case: withThumbnail
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import browser capture."
      },
      { status: 400 }
    );
  }
}

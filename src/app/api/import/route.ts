import { NextRequest, NextResponse } from "next/server";
import { maybeGenerateAppleThumbnail } from "@/lib/apple-thumbnail";
import { isAdminRequest } from "@/lib/auth";
import { importUrl } from "@/lib/importer";
import { createCaseDraft } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const imported = await importUrl(await request.json());
    const importedItems = Array.isArray(imported) ? imported : [imported];
    const items = [];

    for (const item of importedItems) {
      items.push(await maybeGenerateAppleThumbnail(await createCaseDraft(item)));
    }

    const firstItem = items[0];

    return NextResponse.json({
      caseId: firstItem?.id,
      status: firstItem?.status,
      case: firstItem,
      cases: items,
      count: items.length,
      warning: importedItems.find((item) => item.importWarning)?.importWarning
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import this URL."
      },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { pollEmailInbox } from "@/lib/email-poller";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.EMAIL_IMPORT_SECRET;
  const requestSecret = request.nextUrl.searchParams.get("secret");

  if (!configuredSecret || requestSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") || "10");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 25)) : 10;

  try {
    const result = await pollEmailInbox(limit);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to poll email inbox."
      },
      { status: 400 }
    );
  }
}

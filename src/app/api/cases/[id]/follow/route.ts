import { NextRequest, NextResponse } from "next/server";
import { getCaseById, updateCase } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { following?: boolean };
    const existing = await getCaseById(id);

    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const following = typeof body.following === "boolean" ? body.following : existing.meta.following !== "true";
    const updated = await updateCase(id, {
      meta: {
        ...existing.meta,
        following: following ? "true" : "false"
      }
    });

    return NextResponse.json({ case: updated, following });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update follow status."
      },
      { status: 400 }
    );
  }
}

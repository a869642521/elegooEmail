import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { setCaseStatus } from "@/lib/repository";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const item = await setCaseStatus(id, "archived");

  if (!item) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  return NextResponse.json({ case: item });
}

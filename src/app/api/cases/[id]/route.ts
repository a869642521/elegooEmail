import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { deleteCase, updateCase } from "@/lib/repository";

const updateSchema = z.object({
  type: z.enum(["email", "website", "product_page"]).optional(),
  title: z.string().min(1).optional(),
  brandName: z.string().min(1).optional(),
  industry: z.string().nullable().optional(),
  summary: z.string().min(1).optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  screenshotUrl: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  meta: z.record(z.string(), z.string()).optional()
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const item = await updateCase(id, updateSchema.parse(await request.json()));

    if (!item) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json({ case: item });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update case."
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const item = await deleteCase(id);

  if (!item) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, case: item });
}

import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "elegoo_admin";

export function getAdminToken() {
  return process.env.ADMIN_TOKEN || "change-this-admin-token";
}

export async function isAdminSession() {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === getAdminToken();
}

export function isAdminRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;

  return bearer === getAdminToken() || cookieToken === getAdminToken();
}

export async function setAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, getAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

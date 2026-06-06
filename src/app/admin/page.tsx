import { redirect } from "next/navigation";
import { Database, FolderKanban, Settings, Tag } from "lucide-react";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getAdminToken, isAdminSession, setAdminCookie } from "@/lib/auth";
import { listCases } from "@/lib/repository";

async function loginAction(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "");

  if (token !== getAdminToken()) {
    redirect("/admin?error=invalid-token");
  }

  await setAdminCookie();
  redirect("/admin");
}

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const loggedIn = await isAdminSession();

  if (!loggedIn) {
    return (
      <main className="login-card">
        <h1>Admin access.</h1>
        <p>输入管理员 token 后即可收录链接、生成草稿、发布或归档案例。默认 token 见 `.env.example`。</p>
        <form action={loginAction} className="form-stack">
          <input className="text-input" name="token" placeholder="ADMIN_TOKEN" type="password" required />
          <button className="primary-button" type="submit">
            登录后台
          </button>
          {params.error ? <span className="caption" style={{ color: "var(--color-caution)" }}>Token 不正确。</span> : null}
        </form>
      </main>
    );
  }

  const cases = await listCases({ status: "all" });

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <h1>Design CMS</h1>
        <nav className="sidebar-list" aria-label="后台导航">
          <a className="sidebar-item is-active" href="/admin">
            <FolderKanban size={16} aria-hidden="true" />
            案例
          </a>
          <span className="sidebar-item">
            <Database size={16} aria-hidden="true" />
            草稿
          </span>
          <span className="sidebar-item">
            <Tag size={16} aria-hidden="true" />
            标签
          </span>
          <span className="sidebar-item">
            <Settings size={16} aria-hidden="true" />
            设置
          </span>
        </nav>
      </aside>
      <section className="admin-main">
        <AdminDashboard initialCases={cases} />
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { Archive, CheckCircle, ExternalLink, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { BrandAvatar } from "@/components/brand-avatar";
import { CaseVisual } from "@/components/case-visual";
import { caseTypeLabels, statusLabels } from "@/lib/case-labels";
import { getCaseVisualSource } from "@/lib/case-visual-source";
import { formatDate } from "@/lib/utils";
import type { CaseItem, CaseStatus, CaseType } from "@/types/case";

type ExtensionCaptureResponse = {
  type?: string;
  requestId?: string;
  ok?: boolean;
  payload?: unknown;
  error?: string;
  progress?: CaptureProgress;
};

type CaptureProgress = {
  stage?: string;
  message?: string;
  sourceUrl?: string;
  brandName?: string;
  totalLinks?: number;
  skippedExisting?: number;
  captureTotal?: number;
  current?: number;
  captured?: number;
  failed?: number;
  currentUrl?: string;
};

type BatchCapturePayload = {
  batch?: boolean;
  sourceUrl?: string;
  brandName?: string;
  totalLinks?: number;
  skippedExisting?: number;
  skippedLinks?: string[];
  links?: string[];
  captured?: unknown[];
  failed?: Array<{ url?: string; error?: string }>;
};

type ExtensionStatus = "checking" | "connected" | "missing";
type ExtensionMessage = {
  type?: string;
  version?: string;
};

type CaptureModal = "batch" | "single" | null;

function isBrowserCaptureUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname.includes("emaillove.com");
  } catch {
    return false;
  }
}

function isEmailInspireBrandUrl(value: string) {
  try {
    const target = new URL(value);
    const reservedPaths = new Set(["emails", "brands", "industries", "pricing", "login", "signup", "legal", "faq", "contact-us"]);
    const pathParts = target.pathname.split("/").filter(Boolean);

    return target.hostname.includes("emailinspire.com") && pathParts.length === 1 && !reservedPaths.has(pathParts[0]);
  } catch {
    return false;
  }
}

function isBatchCapturePayload(value: unknown): value is BatchCapturePayload {
  return Boolean(value && typeof value === "object" && "batch" in value && Array.isArray((value as BatchCapturePayload).captured));
}

function frontImpact(item: CaseItem) {
  if (item.status === "published") {
    return {
      tone: "live",
      label: "前台可见",
      detail: "会出现在首页、筛选和详情页"
    };
  }

  if (item.status === "archived") {
    return {
      tone: "muted",
      label: "已归档",
      detail: "不会出现在前台，也不能打开详情"
    };
  }

  return {
    tone: "draft",
    label: "草稿中",
    detail: "只在后台管理，不影响前台"
  };
}

function captureProgressPercent(progress: CaptureProgress | null) {
  if (!progress) {
    return 0;
  }

  if (progress.stage === "complete") {
    return 96;
  }

  if (progress.stage === "saving") {
    return 98;
  }

  if (progress.stage === "opening") {
    return 10;
  }

  if (progress.stage === "scanning") {
    return 22;
  }

  if (progress.stage === "collecting") {
    return 28;
  }

  if (progress.stage === "discovered") {
    return 32;
  }

  const total = Number(progress.captureTotal ?? 0);

  if (total > 0) {
    const processed = Math.min(total, Number(progress.current ?? progress.captured ?? 0));
    return Math.min(92, Math.max(34, Math.round(34 + (processed / total) * 58)));
  }

  return 18;
}

function captureProgressStats(progress: CaptureProgress | null) {
  if (!progress) {
    return "等待开始";
  }

  const total = Number(progress.totalLinks ?? 0);
  const skipped = Number(progress.skippedExisting ?? 0);
  const captured = Number(progress.captured ?? 0);
  const failed = Number(progress.failed ?? 0);

  return [`发现 ${total} 个`, `跳过 ${skipped} 个`, `完成 ${captured} 个`, `失败 ${failed} 个`].join(" · ");
}

function requestExtensionCapture(targetUrl: string, skipUrls: string[] = [], onProgress?: (progress: CaptureProgress) => void) {
  return new Promise<unknown>((resolve, reject) => {
    const requestId = `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Chrome 插件未响应。"));
    }, 600000);

    function handleMessage(event: MessageEvent<ExtensionCaptureResponse>) {
      if (event.source !== window || event.data?.requestId !== requestId) {
        return;
      }

      if (event.data?.type === "ELEGOO_CAPTURE_URL_PROGRESS") {
        if (event.data.progress) {
          onProgress?.(event.data.progress);
        }

        return;
      }

      if (event.data?.type !== "ELEGOO_CAPTURE_URL_RESPONSE") {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);

      if (event.data.ok) {
        resolve(event.data.payload);
        return;
      }

      reject(new Error(event.data.error || "插件采集失败。"));
    }

    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        type: "ELEGOO_CAPTURE_URL_REQUEST",
        requestId,
        url: targetUrl,
        skipUrls
      },
      window.location.origin
    );
  });
}

export function AdminDashboard({ initialCases }: { initialCases: CaseItem[] }) {
  const [cases, setCases] = useState(initialCases);
  const [singleUrl, setSingleUrl] = useState("");
  const [singleSkipFetch, setSingleSkipFetch] = useState(false);
  const [batchUrl, setBatchUrl] = useState("");
  const [modalMode, setModalMode] = useState<CaptureModal>(null);
  const [message, setMessage] = useState("");
  const [captureProgress, setCaptureProgress] = useState<CaptureProgress | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>("checking");
  const [statusFilter, setStatusFilter] = useState<"all" | CaseStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | CaseType>("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const singleCaptureReady = isBrowserCaptureUrl(singleUrl) && !singleSkipFetch;
  const trimmedBatchUrl = batchUrl.trim();
  const trimmedSingleUrl = singleUrl.trim();
  const progressPercent = captureProgressPercent(captureProgress);
  const progressStats = captureProgressStats(captureProgress);
  const brandFilters = Array.from(new Set(cases.map((item) => item.brandName).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );
  const filteredCases = cases.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }

    if (typeFilter !== "all" && item.type !== typeFilter) {
      return false;
    }

    if (brandFilter !== "all" && item.brandName !== brandFilter) {
      return false;
    }

    return true;
  });
  const statusFilters: Array<{ label: string; value: "all" | CaseStatus }> = [
    { label: "全部", value: "all" },
    { label: "前台可见", value: "published" },
    { label: "草稿", value: "draft" },
    { label: "归档", value: "archived" }
  ];
  const typeFilters: Array<{ label: string; value: "all" | CaseType }> = [
    { label: "全部类型", value: "all" },
    ...Object.entries(caseTypeLabels).map(([value, label]) => ({ label, value: value as CaseType }))
  ];
  const selectedSet = new Set(selectedIds);
  const allVisibleSelected = filteredCases.length > 0 && filteredCases.every((item) => selectedSet.has(item.id));

  function startExtensionPing() {
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      window.postMessage({ type: "ELEGOO_EXTENSION_PING" }, window.location.origin);

      if (attempts >= 12) {
        window.clearInterval(interval);
        setExtensionStatus((current) => (current === "connected" ? current : "missing"));
      }
    }, 350);

    return interval;
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent<ExtensionMessage>) {
      if (event.source !== window || !["ELEGOO_EXTENSION_PONG", "ELEGOO_EXTENSION_READY"].includes(event.data?.type ?? "")) {
        return;
      }

      setExtensionStatus("connected");
    }

    window.addEventListener("message", handleMessage);
    const interval = startExtensionPing();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  function refreshCases() {
    startTransition(async () => {
      const response = await fetch("/api/cases?status=all");
      const payload = await response.json();
      setCases(payload.cases ?? []);
    });
  }

  async function saveCapturedPayload(parsed: unknown) {
    const response = await fetch("/api/import/browser", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed)
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "浏览器采集导入失败。");
    }

    setCases((current) => {
      const exists = current.some((item) => item.id === payload.case.id);
      return exists ? current.map((item) => (item.id === payload.case.id ? payload.case : item)) : [payload.case, ...current];
    });
    return payload.case as CaseItem;
  }

  async function importCapturedPayload(parsed: unknown, successMessage: string) {
    try {
      await saveCapturedPayload(parsed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "浏览器采集导入失败。");
      return false;
    }

    setMessage(successMessage);
    return true;
  }

  async function importCapturedBatch(result: BatchCapturePayload) {
    const captures = result.captured ?? [];
    let savedCount = 0;
    let failedCount = result.failed?.length ?? 0;

    for (const captured of captures) {
      try {
        await saveCapturedPayload(captured);
        savedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    setMessage(
      `品牌页采集完成：发现 ${result.totalLinks ?? captures.length} 个邮件卡片，跳过已存在 ${result.skippedExisting ?? 0} 个，成功保存 ${savedCount} 个，失败 ${failedCount} 个。`
    );
    return savedCount > 0;
  }

  async function importFromServer(targetUrl: string, skipFetch = false) {
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: targetUrl, skipFetch })
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "导入失败，请稍后再试。");
      return false;
    }

    const importedCount = Number(payload.count ?? 1);
    setMessage(
      payload.warning
        ? `已生成 ${importedCount} 个草稿，但目标网站限制抓取：${payload.warning} 可以手动补充标题、封面和备注。`
        : `已生成 ${importedCount} 个草稿，可以继续补充分类、标签和备注。`
    );
    refreshCases();
    return true;
  }

  function closeModal() {
    if (!isPending) {
      setModalMode(null);
      setCaptureProgress(null);
    }
  }

  function submitSingleCapture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetUrl = trimmedSingleUrl;

    if (!targetUrl) {
      return;
    }

    setMessage("");

    startTransition(async () => {
      if (singleCaptureReady) {
        setMessage("插件采集中：如果是品牌页，会先发现卡片详情链接，再逐个保存完整邮件长图...");

        try {
          const captured = await requestExtensionCapture(
            targetUrl,
            cases.map((item) => item.sourceUrl)
          );
          setMessage("插件已采集到页面内容，正在生成草稿...");
          const imported = isBatchCapturePayload(captured)
            ? await importCapturedBatch(captured)
            : await importCapturedPayload(captured, "已通过 Chrome 插件自动采集并生成草稿。");

          if (imported) {
            setSingleUrl("");
            setSingleSkipFetch(false);
            setModalMode(null);
          }

          return;
        } catch (error) {
          setMessage(`${error instanceof Error ? error.message : "插件采集失败。"} 已退回普通导入，建议确认插件是否已安装并刷新后台。`);
        }
      }

      const imported = await importFromServer(targetUrl, singleSkipFetch);

      if (imported) {
        setSingleUrl("");
        setSingleSkipFetch(false);
        setModalMode(null);
      }
    });
  }

  function submitBatchCapture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetUrl = trimmedBatchUrl;

    if (!targetUrl) {
      return;
    }

    setMessage("");
    setCaptureProgress(null);

    startTransition(async () => {
      if (!isEmailInspireBrandUrl(targetUrl)) {
        setMessage("请使用 Email Inspire 品牌页 URL，例如 https://www.emailinspire.com/insta360。搜索页 /emails?q= 或邮件详情页不适用于批量采集。");
        return;
      }

      if (extensionStatus !== "connected") {
        setMessage("还没有检测到 Chrome 插件。请先安装/刷新插件，再使用 Email Inspire 品牌页批量采集。");
        return;
      }

      setMessage("正在采集品牌页：插件会先发现邮件卡片详情链接，再逐条保存完整 EDM 长图和 HTML...");

      try {
        const captured = await requestExtensionCapture(
          targetUrl,
          cases.map((item) => item.sourceUrl),
          setCaptureProgress
        );

        if (!isBatchCapturePayload(captured)) {
          setMessage("这个链接没有返回品牌页批量结果。请确认输入的是 Email Inspire 品牌页，例如 https://www.emailinspire.com/insta360。");
          return;
        }

        setCaptureProgress((current) => ({
          ...current,
          stage: "saving",
          message: "正在写入本地案例库..."
        }));
        const imported = await importCapturedBatch(captured);

        if (imported) {
          setBatchUrl("");
          setModalMode(null);
          setCaptureProgress(null);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "品牌页批量采集失败。请确认插件已刷新，并且 Chrome 能访问 Email Inspire。");
      }
    });
  }

  function setStatus(id: string, action: "publish" | "archive") {
    startTransition(async () => {
      const response = await fetch(`/api/cases/${id}/${action}`, {
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "状态更新失败。");
        return;
      }

      setCases((current) => current.map((item) => (item.id === id ? payload.case : item)));
      setMessage(action === "publish" ? "案例已发布到前台。" : "案例已归档。");
    });
  }

  function deleteSelectedCase(item: CaseItem) {
    const confirmed = window.confirm(`确定删除「${item.title}」吗？这会从后台移除，已发布案例也会从前台消失。`);

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/cases/${item.id}`, {
        method: "DELETE"
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "删除失败。");
        return;
      }

      setCases((current) => current.filter((caseItem) => caseItem.id !== item.id));
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      setMessage(`已删除「${item.title}」。如果它原本已发布，前台会同步消失。`);
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleVisibleSelection() {
    if (allVisibleSelected) {
      const visibleIds = new Set(filteredCases.map((item) => item.id));
      setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...filteredCases.map((item) => item.id)])));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function toggleBulkEditing() {
    if (isBulkEditing) {
      setSelectedIds([]);
    }

    setIsBulkEditing((current) => !current);
  }

  function bulkSetStatus(action: "publish" | "archive") {
    if (!selectedIds.length) {
      setMessage("请先选择要批量编辑的案例。");
      return;
    }

    const ids = [...selectedIds];

    startTransition(async () => {
      let successCount = 0;
      let failedCount = 0;

      for (const id of ids) {
        const response = await fetch(`/api/cases/${id}/${action}`, {
          method: "POST"
        });
        const payload = await response.json();

        if (!response.ok) {
          failedCount += 1;
          continue;
        }

        successCount += 1;
        setCases((current) => current.map((item) => (item.id === id ? payload.case : item)));
      }

      setMessage(`${action === "publish" ? "批量发布" : "批量归档"}完成：成功 ${successCount} 个，失败 ${failedCount} 个。`);
    });
  }

  function bulkDeleteSelected() {
    if (!selectedIds.length) {
      setMessage("请先选择要删除的案例。");
      return;
    }

    const ids = [...selectedIds];
    const confirmed = window.confirm(`确定删除选中的 ${ids.length} 个案例吗？已发布案例会从前台同步消失。`);

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      let successCount = 0;
      let failedCount = 0;

      for (const id of ids) {
        const response = await fetch(`/api/cases/${id}`, {
          method: "DELETE"
        });

        if (!response.ok) {
          failedCount += 1;
          continue;
        }

        successCount += 1;
      }

      setCases((current) => current.filter((item) => !ids.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setMessage(`批量删除完成：成功 ${successCount} 个，失败 ${failedCount} 个。`);
    });
  }

  return (
    <div className="admin-workspace">
      <section className="admin-panel admin-collector">
        <div className="admin-feed-head">
          <div className="admin-feed-title">
            <h3>案例库</h3>
            <span className="admin-count">{filteredCases.length} / {cases.length} cases</span>
          </div>
          <div className="admin-capture-actions">
            <button className="primary-button" onClick={() => setModalMode("batch")} type="button">
              <Search size={16} aria-hidden="true" />
              批量采集
            </button>
            <button className="dark-button" onClick={() => setModalMode("single")} type="button">
              <Plus size={16} aria-hidden="true" />
              单独采集
            </button>
          </div>
        </div>

        {message ? <p className="admin-message">{message}</p> : null}

        <div className="admin-filter-bar email-filters" aria-label="案例筛选">
          <section className="filter-section filter-section--types">
            <div className="filter-chip-list">
              <button
                aria-pressed={isBulkEditing}
                className={`filter-chip admin-edit-chip ${isBulkEditing ? "is-active" : ""}`}
                onClick={toggleBulkEditing}
                type="button"
              >
                <Pencil size={14} aria-hidden="true" />
                编辑
              </button>
              {typeFilters.map((filter) => (
                <button
                  className={`filter-chip ${typeFilter === filter.value ? "is-active" : ""}`}
                  key={filter.value}
                  onClick={() => setTypeFilter(filter.value)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </section>
          <label className="admin-brand-filter">
            <span>品牌</span>
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="all">全部品牌</option>
              {brandFilters.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </label>
          <div className="feed-tabs feed-tabs--right" aria-label="状态切换">
            {statusFilters.map((filter) => (
              <button
                className={`feed-tab ${statusFilter === filter.value ? "is-active" : ""}`}
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {isBulkEditing ? (
          <div className={`bulk-edit-bar ${selectedIds.length ? "is-active" : ""}`} aria-label="批量编辑工具栏">
            <label className="bulk-select-control">
              <input checked={allVisibleSelected} onChange={toggleVisibleSelection} type="checkbox" />
              {allVisibleSelected ? "取消选择当前筛选" : "选择当前筛选"}
            </label>
            <span>{selectedIds.length ? `已选择 ${selectedIds.length} 个案例` : "未选择案例"}</span>
            <div className="bulk-edit-actions">
              <button className="small-button" disabled={!selectedIds.length || isPending} onClick={() => bulkSetStatus("publish")} type="button">
                <CheckCircle size={14} aria-hidden="true" />
                批量发布
              </button>
              <button className="small-button" disabled={!selectedIds.length || isPending} onClick={() => bulkSetStatus("archive")} type="button">
                <Archive size={14} aria-hidden="true" />
                批量归档
              </button>
              <button className="small-button danger-button" disabled={!selectedIds.length || isPending} onClick={bulkDeleteSelected} type="button">
                <Trash2 size={14} aria-hidden="true" />
                批量删除
              </button>
              <button className="small-button" disabled={!selectedIds.length || isPending} onClick={clearSelection} type="button">
                清空
              </button>
            </div>
          </div>
        ) : null}

        <div className="admin-case-grid" aria-label="后台案例列表">
          {filteredCases.map((item) => {
            const impact = frontImpact(item);

            return (
              <article className={`admin-case-card ${isBulkEditing && selectedSet.has(item.id) ? "is-checked" : ""}`} key={item.id}>
                {isBulkEditing ? (
                  <label className="case-select-check" aria-label={`选择 ${item.title}`}>
                    <input checked={selectedSet.has(item.id)} onChange={() => toggleSelected(item.id)} type="checkbox" />
                  </label>
                ) : null}
                <div className="admin-case-card__header">
                  <span className="admin-case-card__brand">
                    <BrandAvatar brandName={item.brandName} />
                    {item.brandName}
                  </span>
                  <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time>
                </div>
                <div className="admin-case-card__visual">
                  <CaseVisual
                    src={getCaseVisualSource(item)}
                    title={item.title}
                    brandName={item.brandName}
                    type={item.type}
                  />
                  <span className={`front-impact front-impact--${impact.tone}`}>{impact.label}</span>
                </div>
                <div className="admin-case-card__body">
                  <div className="admin-case-card__meta">
                    <span>{caseTypeLabels[item.type]}</span>
                    <span>{statusLabels[item.status]}</span>
                  </div>
                  <h4>{item.title}</h4>
                  <div className="admin-card-actions">
                    {item.status === "published" ? (
                      <a className="small-button" href={`/cases/${item.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} aria-hidden="true" />
                        前台
                      </a>
                    ) : null}
                    <button className="small-button" onClick={() => setStatus(item.id, "publish")} type="button">
                      <CheckCircle size={14} aria-hidden="true" />
                      发布
                    </button>
                    <button className="small-button" onClick={() => setStatus(item.id, "archive")} type="button">
                      <Archive size={14} aria-hidden="true" />
                      归档
                    </button>
                    <button className="small-button danger-button" onClick={() => deleteSelectedCase(item)} type="button">
                      <Trash2 size={14} aria-hidden="true" />
                      删除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {modalMode === "batch" ? (
        <div className="modal-backdrop" role="presentation">
          <section className="capture-modal" aria-labelledby="batch-capture-title" role="dialog" aria-modal="true">
            <div className="capture-modal__head">
              <div>
                <h3 id="batch-capture-title">品牌页批量采集</h3>
              </div>
              <button className="icon-button" onClick={closeModal} type="button" aria-label="关闭">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form className="capture-modal__form" onSubmit={submitBatchCapture}>
              <label>
                Email Inspire 品牌页
                <input
                  className="text-input"
                  value={batchUrl}
                  onChange={(event) => setBatchUrl(event.target.value)}
                  placeholder="https://www.emailinspire.com/insta360"
                  type="url"
                  autoFocus
                />
              </label>
              <p className="capture-modal__hint">只用于 Email Inspire 品牌页。插件会进入页面内每张邮件卡片，保存完整长图和 HTML，并自动跳过已存在案例。</p>
              {isPending || captureProgress ? (
                <div className="capture-progress" aria-live="polite">
                  <div className="capture-progress__head">
                    <span>{captureProgress?.message ?? "准备开始采集..."}</span>
                    <strong>{progressPercent}%</strong>
                  </div>
                  <div className="capture-progress__track" aria-hidden="true">
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                  <p>{progressStats}</p>
                  {captureProgress?.currentUrl ? <small>{captureProgress.currentUrl}</small> : null}
                </div>
              ) : null}
              <button className="primary-button" disabled={!trimmedBatchUrl || isPending} type="submit">
                {isPending ? <Loader2 size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                {isPending ? "采集中..." : "开始采集"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {modalMode === "single" ? (
        <div className="modal-backdrop" role="presentation">
          <section className="capture-modal" aria-labelledby="single-capture-title" role="dialog" aria-modal="true">
            <div className="capture-modal__head">
              <div>
                <h3 id="single-capture-title">单独采集</h3>
              </div>
              <button className="icon-button" onClick={closeModal} type="button" aria-label="关闭">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form className="capture-modal__form" onSubmit={submitSingleCapture}>
              <label>
                链接
                <input
                  className="text-input"
                  value={singleUrl}
                  onChange={(event) => setSingleUrl(event.target.value)}
                  placeholder="https://www.emailinspire.com/..."
                  type="url"
                  autoFocus
                  required
                />
              </label>
              <label className="skip-fetch-control">
                <input checked={singleSkipFetch} onChange={(event) => setSingleSkipFetch(event.target.checked)} type="checkbox" />
                跳过抓取
              </label>
              <button className="primary-button" disabled={!trimmedSingleUrl || isPending} type="submit">
                {isPending ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                开始采集
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

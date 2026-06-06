import { notFound } from "next/navigation";
import Link from "next/link";
import { BrandAvatar } from "@/components/brand-avatar";
import { CaseCard } from "@/components/case-card";
import { CaseVisual } from "@/components/case-visual";
import { EmailHtmlPreview } from "@/components/email-html-preview";
import { FollowButton } from "@/components/follow-button";
import { caseTypeLabels } from "@/lib/case-labels";
import { getCaseVisualSource } from "@/lib/case-visual-source";
import { getCaseBySlug, listCases } from "@/lib/repository";
import { formatDate } from "@/lib/utils";

function metaLabel(key: string) {
  const labels: Record<string, string> = {
    fromName: "发件方",
    subject: "主题",
    preview: "预览文案",
    cta: "行动按钮",
    scenario: "使用场景",
    importedHost: "来源网站",
    sourceId: "来源编号"
  };

  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "来源";
  }
}

export default async function CaseDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getCaseBySlug(slug);

  if (!item || item.status !== "published") {
    notFound();
  }

  const publishedSameType = await listCases({ type: item.type, status: "published" });
  const relatedByBrand = publishedSameType.filter((candidate) => candidate.id !== item.id && candidate.brandName === item.brandName);
  const related = (relatedByBrand.length ? relatedByBrand : publishedSameType.filter((candidate) => candidate.id !== item.id))
    .slice(0, 5);
  const hiddenMetaKeys = new Set([
    "capturedHtml",
    "capturedText",
    "emailHtmlUrl",
    "imageUrls",
    "screenshotDataUrl",
    "importer",
    "importedHost",
    "fromName",
    "fromEmail",
    "subject",
    "preview",
    "sourceId",
    "to"
  ]);
  const visibleMeta = Object.entries(item.meta)
    .filter(([key, value]) => value && !hiddenMetaKeys.has(key))
    .slice(0, 6);
  const archivedImages = (item.meta.imageUrls || "")
    .split("\n")
    .map((url) => url.trim())
    .filter(Boolean);
  const capturedHtml = item.meta.capturedHtml?.trim();
  const emailHtmlUrl = item.meta.emailHtmlUrl?.trim();
  const primaryImageSrc = getCaseVisualSource(item);
  const subject = item.meta.subject || item.title;
  const previewText = item.meta.preview || item.summary;
  const fromText = item.meta.fromName ? `${item.meta.fromName}${item.meta.fromEmail ? ` <${item.meta.fromEmail}>` : ""}` : item.brandName;

  return (
    <main className="email-detail-page">
      <nav className="email-detail-nav" aria-label="案例详情导航">
        <div className="container email-detail-nav__inner">
          <Link href="/">案例库</Link>
          <span>/</span>
          <Link href={`/?brand=${encodeURIComponent(item.brandName)}`}>{item.brandName}</Link>
          <span>/</span>
          <span>{item.title}</span>
        </div>
      </nav>

      <section className="container email-detail-layout" id="overview" aria-label="邮件内容详情">
        <article className="email-canvas" id="creative">
          {capturedHtml ? (
            <div className="archive-preview">
              <EmailHtmlPreview html={capturedHtml} title={`${item.title} 归档邮件 HTML`} />
            </div>
          ) : emailHtmlUrl ? (
            <div className="archive-preview archive-preview--email-love">
              <iframe sandbox="" src={emailHtmlUrl} title={`${item.title} 邮件 HTML`} />
            </div>
          ) : primaryImageSrc ? (
            <div className="email-screenshot-preview">
              <CaseVisual
                src={primaryImageSrc}
                title={`${item.title} 截图预览`}
                brandName={item.brandName}
                type={item.type}
                variant="detail"
              />
            </div>
          ) : null}
        </article>

        <aside className="email-detail-side" id="insights">
          <section className="email-detail-head">
            <h1 className="detail-title">{subject}</h1>
            <p className="detail-summary">{previewText}</p>
            <div className="email-detail-actions" aria-label="案例操作">
              <Link className="email-action-pill email-action-pill--brand" href={`/?brand=${encodeURIComponent(item.brandName)}`}>
                <BrandAvatar brandName={item.brandName} />
                {item.brandName}
              </Link>
              <FollowButton caseId={item.id} initialFollowing={item.meta.following === "true"} />
            </div>
          </section>

          <section className="email-insights__section email-insights__section--panel">
            <div className="email-insights__head">
              <h2>邮件洞察</h2>
            </div>
            <dl className="compact-spec-list compact-spec-list--insights">
              <div>
                <dt>主题</dt>
                <dd>{subject}</dd>
              </div>
              <div>
                <dt>预览文案</dt>
                <dd>{previewText}</dd>
              </div>
              <div>
                <dt>收录时间</dt>
                <dd>{formatDate(item.createdAt)}</dd>
              </div>
              <div>
                <dt>发件方</dt>
                <dd>{fromText}</dd>
              </div>
              <div>
                <dt>邮件类型</dt>
                <dd>{caseTypeLabels[item.type]}</dd>
              </div>
              {item.tags.length ? (
                <div>
                  <dt>业务标签</dt>
                  <dd>{item.tags.map((tag) => tag.name).join(" / ")}</dd>
                </div>
              ) : null}
              <div>
                <dt>来源网站</dt>
                <dd>{hostLabel(item.sourceUrl)}</dd>
              </div>
              <div>
                <dt>图片素材</dt>
                <dd>{archivedImages.length ? `${archivedImages.length} 个素材` : "暂无归档素材"}</dd>
              </div>
              {item.industry ? (
                <div>
                  <dt>行业</dt>
                  <dd>{item.industry}</dd>
                </div>
              ) : null}
              {visibleMeta.map(([key, value]) => (
                <div key={key}>
                  <dt>{metaLabel(key)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

          </section>

          <p className="email-disclaimer">
            这是一封由 {item.brandName} 发送的邮件案例。所有版权和商标归各自所有者所有。Design Library 与 {item.brandName}
            无隶属关系。
          </p>

          {archivedImages.length ? (
            <section className="email-insights__section email-insights__section--compact">
              <h2>图片素材</h2>
              <div className="archive-images" aria-label="归档图片清单">
                {archivedImages.slice(0, 6).map((url, index) => (
                  <a href={url} key={`${url}-${index}`} rel="noreferrer" target="_blank">
                    图片 {index + 1}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </section>

      {related.length ? (
        <section className="container related-emails" id="related">
          <div className="related-emails__header">
            <p className="eyebrow">{relatedByBrand.length ? `${item.brandName} 的其他邮件` : "相关参考"}</p>
            <Link className="ghost-link" href={relatedByBrand.length ? `/?brand=${encodeURIComponent(item.brandName)}` : `/?type=${item.type}`}>
              查看更多
            </Link>
          </div>
          <div className="case-grid">
            {related.map((candidate) => (
              <CaseCard item={candidate} key={candidate.id} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

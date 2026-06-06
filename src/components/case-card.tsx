import Link from "next/link";
import { BrandAvatar } from "@/components/brand-avatar";
import { CaseVisual } from "@/components/case-visual";
import { FollowButton } from "@/components/follow-button";
import { caseTypeLabels } from "@/lib/case-labels";
import { getCaseVisualSource } from "@/lib/case-visual-source";
import { formatDate } from "@/lib/utils";
import type { CaseItem } from "@/types/case";

export function CaseCard({ item }: { item: CaseItem }) {
  return (
    <article className="case-card">
      <div className="case-card__header">
        <Link className="case-card__brand" href={`/?brand=${encodeURIComponent(item.brandName)}`}>
          <BrandAvatar brandName={item.brandName} />
          {item.brandName}
        </Link>
        <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time>
      </div>
      <div className="case-card__visual-wrap">
        <Link href={`/cases/${item.slug}`} aria-label={`查看 ${item.title}`}>
          <CaseVisual
            src={getCaseVisualSource(item)}
            title={item.title}
            brandName={item.brandName}
            type={item.type}
          />
        </Link>
        <FollowButton caseId={item.id} initialFollowing={item.meta.following === "true"} variant="card" />
      </div>
      <div className="case-card__body">
        <h2 className="case-card__title">
          <Link href={`/cases/${item.slug}`}>{item.title}</Link>
        </h2>
        <p className="case-card__summary">{item.summary}</p>
        <div className="case-card__footer">
          <span className="tag">{caseTypeLabels[item.type]}</span>
          {item.tags.slice(0, 3).map((tag) => (
            <span className="tag" key={`${item.id}-${tag.id}`}>
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

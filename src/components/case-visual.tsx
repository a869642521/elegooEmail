"use client";

import { useState } from "react";
import Image from "next/image";
import { caseTypeLabels } from "@/lib/case-labels";
import type { CaseType } from "@/types/case";

export function CaseVisual({
  src,
  title,
  brandName,
  type,
  variant = "card"
}: {
  src?: string | null;
  title: string;
  brandName: string;
  type: CaseType;
  variant?: "card" | "detail";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [detailAspectRatio, setDetailAspectRatio] = useState<number | null>(null);
  const shouldShowImage = Boolean(src) && failedSrc !== src;

  return (
    <div
      className={`case-visual case-visual--${variant}`}
      style={variant === "detail" && detailAspectRatio ? { aspectRatio: detailAspectRatio } : undefined}
    >
      {shouldShowImage ? (
        <Image
          src={src ?? ""}
          alt={title}
          fill
          sizes={variant === "detail" ? "(max-width: 920px) 100vw, 58vw" : "(max-width: 920px) 100vw, 33vw"}
          unoptimized
          onLoad={(event) => {
            if (variant === "detail") {
              const image = event.currentTarget;
              if (image.naturalWidth && image.naturalHeight) {
                setDetailAspectRatio(image.naturalWidth / image.naturalHeight);
              }
            }
          }}
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <div className="case-visual__fallback" aria-label={`${title} preview placeholder`}>
          <div className="case-visual__topbar">
            <span />
            <span />
            <span />
          </div>
          <div className="case-visual__canvas">
            <div>
              <p>{caseTypeLabels[type]}</p>
              <strong>{brandName}</strong>
            </div>
            <div className="case-visual__lines">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

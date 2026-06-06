"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { caseTypeLabels } from "@/lib/case-labels";
import type { CaseTag, CaseType } from "@/types/case";

const types: Array<CaseType | "all"> = ["all", "email", "website", "product_page"];

export function FilterToolbar({
  selectedType,
  selectedFeed,
  keyword,
  selectedBrand,
  selectedTag,
  brands,
  tags
}: {
  selectedType: CaseType | "all";
  selectedFeed: "following" | "featured";
  keyword?: string;
  selectedBrand?: string;
  selectedTag?: string;
  brands: string[];
  tags: CaseTag[];
}) {
  const brandPickerRef = useRef<HTMLDetailsElement>(null);
  const tagPickerRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      for (const picker of [brandPickerRef.current, tagPickerRef.current]) {
        if (picker?.open && !picker.contains(target)) {
          picker.open = false;
        }
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);

    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function closePicker(ref: RefObject<HTMLDetailsElement | null>) {
    window.setTimeout(() => {
      if (ref.current) {
        ref.current.open = false;
      }
    }, 0);
  }

  function buildHref(next: { brand?: string; feed?: "following" | "featured"; tag?: string } = {}) {
    const nextFeed = next.feed ?? selectedFeed;
    const params = new URLSearchParams();

    if (nextFeed !== "featured") {
      params.set("feed", nextFeed);
    }

    if (selectedType !== "all") {
      params.set("type", selectedType);
    }

    if (keyword) {
      params.set("keyword", keyword);
    }

    const brand = next.brand ?? selectedBrand;
    if (brand) {
      params.set("brand", brand);
    }

    const tag = next.tag ?? selectedTag;
    if (tag) {
      params.set("tag", tag);
    }

    return `/?${params.toString()}`;
  }

  return (
    <form className="email-filters" action="/">
      <input name="keyword" type="hidden" value={keyword ?? ""} />
      <input name="feed" type="hidden" value={selectedFeed} />
      <input name="brand" type="hidden" value={selectedBrand ?? ""} />
      <input name="tag" type="hidden" value={selectedTag ?? ""} />

      <section className="filter-section filter-section--types">
        <div className="filter-chip-list">
          {types.map((type) => (
            <button className={`filter-chip ${selectedType === type ? "is-active" : ""}`} name="type" value={type} key={type}>
              {type === "all" ? "全部案例" : caseTypeLabels[type]}
            </button>
          ))}
        </div>
      </section>

      <div className="feed-tabs feed-tabs--right" aria-label="内容切换">
        <details className="brand-picker" ref={brandPickerRef}>
          <summary className={selectedBrand ? "is-selected" : ""}>{selectedBrand || "品牌"}</summary>
          <div className="brand-menu" onClick={() => closePicker(brandPickerRef)}>
            <Link className={!selectedBrand ? "is-active" : ""} href={buildHref({ brand: "" })}>
              全部品牌
            </Link>
            {brands.map((brand) => (
              <Link className={selectedBrand === brand ? "is-active" : ""} href={buildHref({ brand })} key={brand}>
                {brand}
              </Link>
            ))}
          </div>
        </details>
        <details className="brand-picker tag-picker" ref={tagPickerRef}>
          <summary>{selectedTag || "全部标签"}</summary>
          <div className="brand-menu" onClick={() => closePicker(tagPickerRef)}>
            <Link className={!selectedTag ? "is-active" : ""} href={buildHref({ tag: "" })}>
              全部标签
            </Link>
            {tags.map((tag) => (
              <Link className={selectedTag === tag.name ? "is-active" : ""} href={buildHref({ tag: tag.name })} key={tag.id}>
                {tag.name}
              </Link>
            ))}
          </div>
        </details>
        <Link
          className={`feed-tab ${selectedFeed === "following" ? "is-active" : ""}`}
          href={selectedFeed === "following" ? buildHref({ feed: "featured" }) : buildHref({ feed: "following" })}
        >
          关注
        </Link>
        <Link className="feed-tab feed-tab--primary" href="/admin">
          <Plus size={14} aria-hidden="true" />
          收录新案例
        </Link>
      </div>
    </form>
  );
}

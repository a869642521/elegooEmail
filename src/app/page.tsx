import { CaseCard } from "@/components/case-card";
import { FilterToolbar } from "@/components/filter-toolbar";
import { getCaseReceivedTime } from "@/lib/case-dates";
import { listCases, listTagFacets } from "@/lib/repository";
import type { CaseType } from "@/types/case";
import { Search } from "lucide-react";

type SearchParams = Promise<{
  type?: CaseType | "all";
  feed?: "following" | "featured";
  keyword?: string;
  brand?: string;
  tag?: string;
  sort?: "newest" | "oldest";
}>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedType = params.type ?? "all";
  const selectedFeed = params.feed === "following" ? "following" : "featured";
  const selectedSort = params.sort === "oldest" ? "oldest" : "newest";
  const [publishedCases, facets] = await Promise.all([
    listCases({
      type: selectedType,
      keyword: params.keyword,
      brand: params.brand,
      tag: params.tag,
      status: "published"
    }),
    listTagFacets()
  ]);
  const filteredCases =
    selectedFeed === "following"
      ? publishedCases.filter(
          (item) =>
            item.meta.following === "true" ||
            item.tags.some((tag) => ["following", "followed", "关注"].includes(tag.name.toLowerCase()))
        )
      : publishedCases;
  const cases = [...filteredCases].sort((a, b) => {
    const diff = getCaseReceivedTime(b) - getCaseReceivedTime(a);
    return selectedSort === "oldest" ? -diff : diff;
  });

  return (
    <main>
      <section className="emails-hero">
        <div className="container emails-hero__copy">
          <h1>
            <span className="brand-title-accent">ELEGOO</span> Design Reference
          </h1>
          <form className="email-search email-search--hero" action="/">
            <Search size={18} aria-hidden="true" />
            <input name="keyword" defaultValue={params.keyword} placeholder="Search emails & brands..." />
            <input name="type" type="hidden" value={selectedType} />
            <input name="feed" type="hidden" value={selectedFeed} />
            <input name="sort" type="hidden" value={selectedSort} />
            <input name="brand" type="hidden" value={params.brand ?? ""} />
            <input name="tag" type="hidden" value={params.tag ?? ""} />
          </form>
        </div>
      </section>

      <section className="container email-browser" aria-label="案例浏览">
        <div className="email-results">
          <FilterToolbar
            selectedType={selectedType}
            selectedFeed={selectedFeed}
            keyword={params.keyword}
            selectedBrand={params.brand}
            selectedTag={params.tag}
            selectedSort={selectedSort}
            brands={facets.brands}
            tags={facets.tags}
          />

          {cases.length ? (
            <div className="case-grid case-grid--email-feed">
              {cases.map((item) => (
                <CaseCard item={item} key={item.id} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {selectedFeed === "following"
                ? "还没有关注的案例。后续可以在卡片上加收藏按钮，把常看的参考放到这里。"
                : "暂时没有匹配的案例。调整筛选条件，或先去后台收录一个新参考。"}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

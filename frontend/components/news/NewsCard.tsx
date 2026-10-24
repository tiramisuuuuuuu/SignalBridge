import type { NewsArticle } from "@/types";
import { timeAgo } from "@/lib/time";

export default function NewsCard({ article, featured = false }: { article: NewsArticle; featured?: boolean }) {
  return (
    <article className={`card ${featured ? "featured" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={article.imageUrl} alt="" loading="lazy" />
      <div className="card-body">
        <h3>{article.headline}</h3>
        <p className="muted">{article.summary}</p>
        <p className="meta">{article.publisher} · {timeAgo(article.publishedAt)} · {article.location}</p>
        <a className="btn small" href={article.articleUrl} target="_blank" rel="noreferrer">Read article</a>
      </div>
    </article>
  );
}

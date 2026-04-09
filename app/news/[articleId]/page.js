import { notFound } from "next/navigation";
import NewsArticle from "../../../components/news-article";
import { getCachedNewsArticle, getRelatedArticles } from "../../../lib/market-data";
import { getArticleSummary } from "../../../lib/ai-summary";

export const dynamic = "force-dynamic";

export default async function NewsArticlePage({ params }) {
  const { articleId } = await params;
  const article = await getCachedNewsArticle(articleId);

  if (!article) {
    notFound();
  }

  const [aiSummary, relatedArticles] = await Promise.all([
    getArticleSummary(article),
    getRelatedArticles(article)
  ]);

  return <NewsArticle article={article} aiSummary={aiSummary} relatedArticles={relatedArticles} />;
}

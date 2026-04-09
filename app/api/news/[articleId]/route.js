import { NextResponse } from "next/server";
import { getCachedNewsArticle } from "../../../../lib/market-data";

export async function GET(_request, { params }) {
  const { articleId } = await params;
  const article = await getCachedNewsArticle(articleId);

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  return NextResponse.json(article);
}

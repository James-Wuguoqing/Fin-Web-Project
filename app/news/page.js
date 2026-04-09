import NewsCenter from "../../components/news-center";
import { getCachedNewsFeedState } from "../../lib/market-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FinScope 新闻中心",
  description: "聚合 Alpha Vantage 与 Twelve Data 财经新闻，支持进入详情页查看摘要。"
};

export default async function NewsPage() {
  const newsData = await getCachedNewsFeedState();

  return <NewsCenter data={newsData} />;
}

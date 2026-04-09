import MarketsOverview from "../../components/markets-overview";
import { getCachedMarketsData } from "../../lib/market-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FinScope 市场分类",
  description: "以 ETF 代理资产扩展成更完整的市场分类总览。"
};

export default async function MarketsPage() {
  const data = await getCachedMarketsData();

  return <MarketsOverview data={data} />;
}

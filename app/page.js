import MarketHome from "../components/market-home";
import JsonLd from "../components/json-ld";
import { getCachedHomepageData } from "../lib/market-data";
import { getInitialView } from "../lib/home-sections";
import { absoluteUrl, siteName } from "../lib/site-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "市场概览",
  description: "查看 FinScope 的市场概览页面，聚合市场看板与市场分类入口，快速浏览核心资产走势。",
  alternates: {
    canonical: absoluteUrl("/")
  },
  openGraph: {
    title: `市场概览 | ${siteName}`,
    description: "查看 FinScope 的市场概览页面，聚合市场看板与市场分类入口，快速浏览核心资产走势。",
    url: absoluteUrl("/")
  },
  twitter: {
    title: `市场概览 | ${siteName}`,
    description: "查看 FinScope 的市场概览页面，聚合市场看板与市场分类入口，快速浏览核心资产走势。"
  }
};

export default async function HomePage({ searchParams }) {
  const homepageData = await getCachedHomepageData();
  const params = await searchParams;
  const view = getInitialView("overview", params?.view);
  const pageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "市场概览",
    url: absoluteUrl("/"),
    description: "聚合市场看板与市场分类入口，快速浏览核心资产走势。",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: absoluteUrl("/")
    }
  };

  return (
    <>
      <JsonLd data={pageJsonLd} />
      <MarketHome data={homepageData} initialSection="overview" initialView={view} />
    </>
  );
}

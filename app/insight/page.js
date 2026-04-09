import MarketHome from "../../components/market-home";
import JsonLd from "../../components/json-ld";
import { getCachedHomepageData } from "../../lib/market-data";
import { getInitialView } from "../../lib/home-sections";
import { absoluteUrl, siteName } from "../../lib/site-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "策略",
  description: "查看 FinScope 策略页面，关注本周观察重点与策略图表，辅助投资判断。",
  alternates: {
    canonical: absoluteUrl("/insight")
  },
  openGraph: {
    title: `策略 | ${siteName}`,
    description: "查看 FinScope 策略页面，关注本周观察重点与策略图表，辅助投资判断。",
    url: absoluteUrl("/insight")
  },
  twitter: {
    title: `策略 | ${siteName}`,
    description: "查看 FinScope 策略页面，关注本周观察重点与策略图表，辅助投资判断。"
  }
};

export default async function InsightPage({ searchParams }) {
  const homepageData = await getCachedHomepageData();
  const params = await searchParams;
  const view = getInitialView("insight", params?.view);
  const pageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "策略",
    url: absoluteUrl("/insight"),
    description: "关注本周观察重点与策略图表，辅助投资判断。",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: absoluteUrl("/")
    }
  };

  return (
    <>
      <JsonLd data={pageJsonLd} />
      <MarketHome data={homepageData} initialSection="insight" initialView={view} />
    </>
  );
}

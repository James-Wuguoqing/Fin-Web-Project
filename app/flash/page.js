import MarketHome from "../../components/market-home";
import JsonLd from "../../components/json-ld";
import { getCachedHomepageData } from "../../lib/market-data";
import { getInitialView } from "../../lib/home-sections";
import { absoluteUrl, siteName } from "../../lib/site-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "快讯",
  description: "查看 FinScope 快讯页面，浏览新闻卡片与新闻中心入口，快速跟进市场动态。"
  ,
  alternates: {
    canonical: absoluteUrl("/flash")
  },
  openGraph: {
    title: `快讯 | ${siteName}`,
    description: "查看 FinScope 快讯页面，浏览新闻卡片与新闻中心入口，快速跟进市场动态。",
    url: absoluteUrl("/flash")
  },
  twitter: {
    title: `快讯 | ${siteName}`,
    description: "查看 FinScope 快讯页面，浏览新闻卡片与新闻中心入口，快速跟进市场动态。"
  }
};

export default async function FlashPage({ searchParams }) {
  const homepageData = await getCachedHomepageData();
  const params = await searchParams;
  const view = getInitialView("news", params?.view);
  const pageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "快讯",
    url: absoluteUrl("/flash"),
    description: "浏览新闻卡片与新闻中心入口，快速跟进市场动态。",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: absoluteUrl("/")
    }
  };

  return (
    <>
      <JsonLd data={pageJsonLd} />
      <MarketHome data={homepageData} initialSection="news" initialView={view} />
    </>
  );
}

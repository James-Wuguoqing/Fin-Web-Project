import MarketHome from "../../components/market-home";
import JsonLd from "../../components/json-ld";
import { getCachedHomepageData } from "../../lib/market-data";
import { getInitialView } from "../../lib/home-sections";
import { absoluteUrl, siteName } from "../../lib/site-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "深度栏目",
  description: "浏览 FinScope 深度栏目，查看封面深读与宏观栏目，理解市场背后的主线逻辑。",
  alternates: {
    canonical: absoluteUrl("/focus")
  },
  openGraph: {
    title: `深度栏目 | ${siteName}`,
    description: "浏览 FinScope 深度栏目，查看封面深读与宏观栏目，理解市场背后的主线逻辑。",
    url: absoluteUrl("/focus")
  },
  twitter: {
    title: `深度栏目 | ${siteName}`,
    description: "浏览 FinScope 深度栏目，查看封面深读与宏观栏目，理解市场背后的主线逻辑。"
  }
};

export default async function FocusPage({ searchParams }) {
  const homepageData = await getCachedHomepageData();
  const params = await searchParams;
  const view = getInitialView("focus", params?.view);
  const pageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "深度栏目",
    url: absoluteUrl("/focus"),
    description: "查看封面深读与宏观栏目，理解市场背后的主线逻辑。",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: absoluteUrl("/")
    }
  };

  return (
    <>
      <JsonLd data={pageJsonLd} />
      <MarketHome data={homepageData} initialSection="focus" initialView={view} />
    </>
  );
}

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
export const siteName = "FinScope 财经前沿";
export const siteDescription = "FinScope 提供市场概览、板块追踪、财经快讯与投资视角。";

export function absoluteUrl(pathname = "/") {
  return new URL(pathname, siteUrl).toString();
}

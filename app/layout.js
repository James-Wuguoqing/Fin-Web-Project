import "./globals.css";
import JsonLd from "../components/json-ld";
import { absoluteUrl, siteDescription, siteName, siteUrl } from "../lib/site-config";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`
  },
  description: siteDescription,
  alternates: {
    canonical: absoluteUrl("/")
  },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    url: absoluteUrl("/"),
    siteName,
    title: siteName,
    description: siteDescription
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription
  }
};

export default function RootLayout({ children }) {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: absoluteUrl("/"),
    description: siteDescription,
    inLanguage: "zh-Hant"
  };

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: absoluteUrl("/")
  };

  return (
    <html lang="zh-Hant" data-scroll-behavior="smooth">
      <body>
        {children}
        <JsonLd data={websiteJsonLd} />
        <JsonLd data={organizationJsonLd} />
      </body>
    </html>
  );
}

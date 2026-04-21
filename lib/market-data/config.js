export const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
export const FRED_API_KEY = process.env.FRED_API_KEY;
export const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
export const MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER || "twelve-data";

export const alphaBaseUrl = "https://www.alphavantage.co/query";
export const fredBaseUrl = "https://api.stlouisfed.org/fred/series/observations";
export const twelveDataBaseUrl = "https://api.twelvedata.com";
export const ALPHA_REQUEST_INTERVAL_MS = 1200;
export const LIVE_REFRESH_MS = 1000 * 60 * 5;
export const LIVE_REVALIDATE_SECONDS = 300;
export const MACRO_REFRESH_MS = 1000 * 60 * 60;
export const MACRO_REVALIDATE_SECONDS = 3600;
export const NEWS_ARTICLE_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;
export const NEWS_ARTICLE_ARCHIVE_LIMIT = 48;
export const NEWS_ARTICLE_INDEX_KEY = "news-article-index-v1";
export const PRESS_RELEASE_SYMBOLS = ["MSFT", "NVDA", "AAPL", "AMZN", "META", "AMD"];

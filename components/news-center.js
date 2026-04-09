import Link from "next/link";
import styles from "./news-pages.module.css";

export default function NewsCenter({ data }) {
  const articles = data.articles ?? [];
  const syncStatus = data.syncStatus || {
    label: "最新",
    detail: data.updatedLabel,
    tone: "positive"
  };
  const statusClass =
    syncStatus.tone === "warning"
      ? styles.statusWarning
      : syncStatus.tone === "neutral"
        ? styles.statusNeutral
        : styles.statusPositive;

  return (
    <main className={styles.pageShell}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>News Center</p>
        <h1>财经新闻中心</h1>
        <p className={styles.lead}>聚合 Alpha Vantage 与 Twelve Data 的市场新闻，并为每条新闻提供站内详情页和原文跳转。</p>
        <div className={styles.heroActions}>
          <Link href="/">返回首页</Link>
          <Link href="/markets">查看市场分类</Link>
        </div>
        <div className={`${styles.statusBar} ${statusClass}`}>
          <div className={styles.statusBadge}>
            <span className={styles.statusDot} aria-hidden="true" />
            <strong>{syncStatus.label}</strong>
          </div>
          <small className={styles.updatedNote}>{syncStatus.detail}</small>
        </div>
      </section>

      <section className={styles.grid}>
        {articles.map((article) => (
          <article key={article.id} className={styles.card}>
            <div className={styles.cardMeta}>
              <span>{article.badge}</span>
              <small>{article.publishedAt}</small>
            </div>
            <h2>{article.title}</h2>
            <p>{article.summary}</p>
            <div className={styles.topicRow}>
              {article.topics.map((topic) => (
                <span key={topic}>{topic}</span>
              ))}
            </div>
            <div className={styles.actions}>
              <Link href={`/news/${article.id}`}>查看详情</Link>
              {article.url ? (
                <a href={article.url} target="_blank" rel="noreferrer">
                  打开原文
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

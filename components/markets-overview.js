import Link from "next/link";
import styles from "./markets-overview.module.css";

export default function MarketsOverview({ data }) {
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
        <p className={styles.eyebrow}>Markets Catalog</p>
        <h1>市场分类页</h1>
        <p className={styles.lead}>把首页里用 ETF 代理的指数逻辑升级成完整分类页，便于后续扩展板块、地区、债券和商品。</p>
        <div className={styles.heroActions}>
          <Link href="/">返回首页</Link>
          <Link href="/news">查看新闻中心</Link>
        </div>
        <div className={`${styles.statusBar} ${statusClass}`}>
          <div className={styles.statusBadge}>
            <span className={styles.statusDot} aria-hidden="true" />
            <strong>{syncStatus.label}</strong>
          </div>
          <small>{syncStatus.detail}</small>
        </div>
      </section>

      <section className={styles.groupStack}>
        {data.groups.map((group) => (
          <article key={group.title} className={styles.groupCard}>
            <div className={styles.groupHeader}>
              <div>
                <p className={styles.groupTitle}>{group.title}</p>
                <p className={styles.groupDescription}>{group.description}</p>
              </div>
            </div>
            <div className={styles.groupGrid}>
              {group.items.map((item) => (
                <div key={item.label} className={`${styles.marketCard} ${styles[item.tone]}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.change}</small>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

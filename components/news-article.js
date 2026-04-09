import Link from "next/link";
import styles from "./news-pages.module.css";

export default function NewsArticle({ article, aiSummary, relatedArticles }) {
  return (
    <main className={styles.pageShell}>
      <section className={styles.articleHero}>
        <p className={styles.eyebrow}>{article.source}</p>
        <h1>{article.title}</h1>
        <div className={styles.articleMeta}>
          <span>{article.publishedAt}</span>
          <span>情绪: {article.sentiment}</span>
        </div>
        <p className={styles.lead}>{article.summary}</p>
        <div className={styles.topicRow}>
          {article.tickers.map((ticker) => (
            <span key={ticker}>{ticker}</span>
          ))}
          {article.topics.map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
        <div className={styles.heroActions}>
          <Link href="/news">返回新闻中心</Link>
          <Link href="/markets">查看市场分类</Link>
          {article.url ? (
            <a href={article.url} target="_blank" rel="noreferrer">
              阅读原文
            </a>
          ) : null}
        </div>
      </section>

      <section className={styles.articleBody}>
        <article className={styles.card}>
          <h2>原始摘要</h2>
          <p>{article.summary}</p>
        </article>
        <article className={styles.card}>
          <h2>AI 摘要</h2>
          <p>{aiSummary}</p>
        </article>
      </section>

      <section className={styles.articleBody}>
        <article className={styles.card}>
          <h2>编辑视角</h2>
          <p>这条新闻详情页现在会结合主题、代码和来源信息生成 AI 摘要，并为读者提供相关文章入口，方便继续深挖同一条市场主线。</p>
        </article>
        <article className={styles.card}>
          <h2>相关文章</h2>
          <div className={styles.relatedList}>
            {relatedArticles.length > 0 ? (
              relatedArticles.map((item) => (
                <Link key={item.id} href={`/news/${item.id}`} className={styles.relatedLink}>
                  <strong>{item.title}</strong>
                  <span>{item.source}</span>
                </Link>
              ))
            ) : (
              <p>当前没有更相关的文章，后续可继续扩展为向量检索或标签聚类。</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

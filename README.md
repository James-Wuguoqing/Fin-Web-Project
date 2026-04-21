# FinScope Next

## 本地运行方式

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:3000
```

生产构建与启动：

```bash
npm run build
npm run start
```

可选环境变量：

```text
NEXT_PUBLIC_SITE_URL
ALPHA_VANTAGE_API_KEY
FRED_API_KEY
TWELVE_DATA_API_KEY
MARKET_DATA_PROVIDER
OPENAI_API_KEY
OPENAI_SUMMARY_MODEL
```

未配置行情或 OpenAI 相关 key 时，项目会使用已有回退逻辑展示降级内容。

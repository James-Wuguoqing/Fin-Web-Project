"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getInitialAuthValues, submitAuthRequest, validateAuthValues } from "../lib/auth-client";
import styles from "./auth-shell.module.css";

const authModes = {
  login: {
    title: "登录 FinScope",
    eyebrow: "Account Access",
    description: "登录后同步自选资产、快讯订阅、策略偏好与站内阅读记录。",
    submitLabel: "进入工作台",
    secondaryLabel: "没有账户？去注册",
    secondaryHref: "/register",
    helper: "支持邮箱、手机号、验证码和第三方 OAuth 的接入位都已经预留。",
    primaryFields: [
      {
        name: "account",
        label: "邮箱或手机号",
        type: "text",
        placeholder: "name@company.com"
      },
      {
        name: "password",
        label: "密码",
        type: "password",
        placeholder: "输入密码"
      }
    ]
  },
  register: {
    title: "注册 FinScope",
    eyebrow: "Create Account",
    description: "创建账户后可以建立自选池、保存市场视图，并接收你自己的财经更新流。",
    submitLabel: "创建账户",
    secondaryLabel: "已有账户？去登录",
    secondaryHref: "/login",
    helper: "后续可以在这里接会员分层、通知偏好、双重验证和团队席位。",
    primaryFields: [
      {
        name: "name",
        label: "昵称",
        type: "text",
        placeholder: "输入你的昵称"
      },
      {
        name: "email",
        label: "注册邮箱",
        type: "email",
        placeholder: "name@company.com"
      },
      {
        name: "password",
        label: "设置密码",
        type: "password",
        placeholder: "至少 8 位密码"
      },
      {
        name: "confirmPassword",
        label: "确认密码",
        type: "password",
        placeholder: "再次输入密码"
      }
    ]
  }
};

const platformHighlights = [
  {
    label: "实时市场",
    value: "5m",
    note: "服务端缓存刷新"
  },
  {
    label: "新闻中心",
    value: "AI",
    note: "摘要和相关推荐"
  },
  {
    label: "策略面板",
    value: "4",
    note: "独立频道入口"
  }
];

export default function AuthShell({ mode = "login" }) {
  const currentMode = authModes[mode] || authModes.login;
  const isLogin = mode === "login";
  const [values, setValues] = useState(() => getInitialAuthValues(mode));
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    setValues(getInitialAuthValues(mode));
    setErrors({});
    setIsSubmitting(false);
    setNotice(null);
  }, [mode]);

  function handleFieldChange(fieldName, value) {
    setValues((currentValues) => ({
      ...currentValues,
      [fieldName]: value
    }));
    setErrors((currentErrors) => {
      if (!currentErrors[fieldName]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldName];
      return nextErrors;
    });
    setNotice(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateAuthValues(mode, values);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setNotice({
        tone: "error",
        message: "请先修正表单中的提示。"
      });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    try {
      const result = await submitAuthRequest(mode, values);

      setNotice({
        tone: "success",
        message: result.message
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error.message || "提交失败，请稍后再试。"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.pageShell}>
      <section className={styles.workspaceFrame}>
        <aside className={styles.sideRail}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark}>F</span>
            <span>
              <strong>FinScope</strong>
              <small>Finance Workspace</small>
            </span>
          </Link>

          <div className={styles.sideCopy}>
            <p className={styles.eyebrow}>Workspace Access</p>
            <h1>把账户入口也做成同一套 fintech 工作台体验。</h1>
            <p>
              这里保留轻量、连续、一体化的产品层级，避免登录页和主站割裂成两种视觉语言。
            </p>
          </div>

          <div className={styles.metricGrid}>
            {platformHighlights.map((item) => (
              <article key={item.label} className={styles.metricCard}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.note}</small>
              </article>
            ))}
          </div>

          <div className={styles.sideLinks}>
            <Link href="/">返回市场概览</Link>
            <Link href="/news">查看新闻中心</Link>
          </div>
        </aside>

        <section className={styles.formStage}>
          <div className={styles.stageHeader}>
            <div className={styles.stageTopline}>
              <span className={styles.statusDot} aria-hidden="true" />
              <small>统一账户入口</small>
            </div>
            <div className={styles.tabRow} role="tablist" aria-label="账户入口">
              <Link
                href="/login"
                className={`${styles.authTab} ${isLogin ? styles.authTabActive : ""}`}
                aria-current={isLogin ? "page" : undefined}
              >
                登录
              </Link>
              <Link
                href="/register"
                className={`${styles.authTab} ${!isLogin ? styles.authTabActive : ""}`}
                aria-current={!isLogin ? "page" : undefined}
              >
                注册
              </Link>
            </div>
          </div>

          <section className={styles.formCard}>
            <p className={styles.eyebrow}>{currentMode.eyebrow}</p>
            <h2>{currentMode.title}</h2>
            <p className={styles.description}>{currentMode.description}</p>

            <form className={styles.formGrid} noValidate onSubmit={handleSubmit}>
              {currentMode.primaryFields.map((field) => (
                <label key={field.label} className={styles.field}>
                  <span>{field.label}</span>
                  <input
                    name={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={values[field.name] || ""}
                    aria-invalid={Boolean(errors[field.name])}
                    aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                    onChange={(event) => handleFieldChange(field.name, event.target.value)}
                  />
                  {errors[field.name] ? (
                    <small id={`${field.name}-error`} className={styles.fieldError}>
                      {errors[field.name]}
                    </small>
                  ) : null}
                </label>
              ))}

              {notice ? (
                <p
                  className={`${styles.formNotice} ${
                    notice.tone === "success" ? styles.formNoticeSuccess : styles.formNoticeError
                  }`}
                  role={notice.tone === "success" ? "status" : "alert"}
                >
                  {notice.message}
                </p>
              ) : null}

              <div className={styles.formActions}>
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "提交中..." : currentMode.submitLabel}
                </button>
                <Link className={styles.secondaryLink} href={currentMode.secondaryHref}>
                  {currentMode.secondaryLabel}
                </Link>
              </div>
            </form>

            <div className={styles.helperCard}>
              <strong>接入说明</strong>
              <p>{currentMode.helper}</p>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

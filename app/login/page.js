import AuthShell from "../../components/auth-shell";

export const metadata = {
  title: "登录 | FinScope 财经前沿",
  description: "进入 FinScope 账户中心，登录后同步自选、快讯订阅与策略偏好。"
};

export default function LoginPage() {
  return <AuthShell mode="login" />;
}

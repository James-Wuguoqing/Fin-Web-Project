import AuthShell from "../../components/auth-shell";

export const metadata = {
  title: "注册 | FinScope 财经前沿",
  description: "创建 FinScope 账户，开启自选市场、资讯订阅与策略跟踪。"
};

export default function RegisterPage() {
  return <AuthShell mode="register" />;
}

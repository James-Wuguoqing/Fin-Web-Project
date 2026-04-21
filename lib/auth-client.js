const requestDelayMs = 450;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getInitialAuthValues(mode = "login") {
  if (mode === "register") {
    return {
      name: "",
      email: "",
      password: "",
      confirmPassword: ""
    };
  }

  return {
    account: "",
    password: ""
  };
}

export function validateAuthValues(mode, values) {
  const errors = {};

  if (mode === "register") {
    if (!values.name?.trim()) {
      errors.name = "请输入昵称。";
    }

    if (!values.email?.trim()) {
      errors.email = "请输入注册邮箱。";
    } else if (!emailPattern.test(values.email.trim())) {
      errors.email = "请输入有效的邮箱地址。";
    }

    if (!values.password) {
      errors.password = "请设置密码。";
    } else if (values.password.length < 8) {
      errors.password = "密码至少需要 8 位。";
    }

    if (!values.confirmPassword) {
      errors.confirmPassword = "请再次输入密码。";
    } else if (values.password !== values.confirmPassword) {
      errors.confirmPassword = "两次输入的密码不一致。";
    }

    return errors;
  }

  if (!values.account?.trim()) {
    errors.account = "请输入邮箱或手机号。";
  }

  if (!values.password) {
    errors.password = "请输入密码。";
  }

  return errors;
}

export async function submitAuthRequest(mode, values) {
  if (mode !== "login" && mode !== "register") {
    throw new Error("Unsupported authentication mode.");
  }

  const submittedFields = Object.entries(values)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);

  // Keep the request boundary in one place so a real API can replace this stub later.
  await wait(requestDelayMs);

  return {
    ok: true,
    mode,
    submittedFields,
    submittedAt: new Date().toISOString(),
    message:
      mode === "register"
        ? "前端注册流程已通过，真实注册接口待接入。"
        : "前端登录流程已通过，真实登录接口待接入。"
  };
}

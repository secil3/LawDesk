import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin.e2e@lawdesk.test";
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD || "E2eAdminParolasi123!";
const MAILHOG_API_URL =
  process.env.MAILHOG_API_URL || "http://127.0.0.1:8025";

const collectStrings = (value, output = []) => {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }

  return output;
};

const decodeQuotedPrintable = (value) => {
  return String(value)
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
};

const activationUrlFromMailHog = async (apiRequest, recipient) => {
  const response = await apiRequest.get(
    `${MAILHOG_API_URL}/api/v2/messages?limit=50`,
  );

  if (!response.ok()) {
    return null;
  }

  const body = await response.json();
  const messages = Array.isArray(body) ? body : body.items || body.Items || [];

  for (const message of messages) {
    const strings = collectStrings(message);

    if (
      !strings.some((value) =>
        value.toLocaleLowerCase("en-US").includes(
          recipient.toLocaleLowerCase("en-US"),
        ),
      )
    ) {
      continue;
    }

    for (const value of strings) {
      const normalized = decodeQuotedPrintable(value)
        .replaceAll("&amp;", "&")
        .replaceAll("&#x3D;", "=")
        .replaceAll("&#61;", "=");
      const match = normalized.match(
        /https?:\/\/[^\s"'<>]+\/activate\?token=[A-Za-z0-9_-]{43}/,
      );

      if (match) {
        return match[0];
      }
    }
  }

  return null;
};

const login = async (page, email, password) => {
  await page.goto("/login");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
};

test("registration, approval, email activation, login and task creation", async ({
  browser,
  request,
}) => {
  const uniqueSuffix = `${Date.now()}-${process.pid}`;
  const candidateName = `E2E Aday ${uniqueSuffix}`;
  const candidateEmail = `e2e-${uniqueSuffix}@lawdesk.test`;
  const candidatePassword = "E2eGuvenliParola123!";
  const taskTitle = `E2E görev ${uniqueSuffix}`;

  await request.delete(`${MAILHOG_API_URL}/api/v1/messages`).catch(() => {});

  const registrationContext = await browser.newContext();
  const registrationPage = await registrationContext.newPage();
  await registrationPage.goto("/register");
  await registrationPage.getByLabel("Ad soyad", { exact: true }).fill(
    candidateName,
  );
  await registrationPage.getByLabel("E-posta", { exact: true }).fill(
    candidateEmail,
  );
  await registrationPage.getByRole("button", {
    name: "Başvuruyu gönder",
    exact: true,
  }).click();
  await expect(registrationPage.getByRole("status")).toContainText(
    "Başvurunuz alınmıştır",
  );
  await registrationContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
  await adminPage.getByRole("button", {
    name: "Kayıt Talepleri",
    exact: true,
  }).click();
  await expect(
    adminPage.getByRole("heading", { name: "Kayıt talepleri" }).first(),
  ).toBeVisible();
  await adminPage.getByRole("button", {
    name: new RegExp(candidateEmail.replaceAll(".", "\\."), "i"),
  }).click();
  await expect(
    adminPage.getByRole("heading", { name: candidateName, exact: true }),
  ).toBeVisible();
  await adminPage.getByRole("checkbox", { name: "Uyum", exact: true }).check();
  await adminPage.getByRole("button", {
    name: "Onayla ve aktivasyon e-postası gönder",
    exact: true,
  }).click();
  await expect(adminPage.getByRole("status")).toContainText(
    /aktivasyon e-postası (gönderildi|sıraya alındı)/,
  );
  await adminContext.close();

  let activationUrl = null;
  await expect.poll(
    async () => {
      activationUrl = await activationUrlFromMailHog(request, candidateEmail);
      return Boolean(activationUrl);
    },
    {
      message: "Activation email did not arrive in MailHog",
      timeout: 30000,
      intervals: [250, 500, 1000],
    },
  ).toBe(true);

  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.goto(activationUrl);
  await expect(
    candidatePage.getByRole("heading", { name: "Parolanızı belirleyin" }),
  ).toBeVisible();
  await candidatePage.getByLabel("Parola", { exact: true }).fill(
    candidatePassword,
  );
  await candidatePage.getByLabel("Parola tekrar", { exact: true }).fill(
    candidatePassword,
  );
  await candidatePage.getByRole("button", {
    name: "Parolayı kaydet ve aktifleştir",
    exact: true,
  }).click();
  await expect(candidatePage.getByRole("status")).toContainText(
    "Hesabınız aktifleştirildi",
  );

  await candidatePage.getByRole("button", {
    name: "Giriş Sayfasına Git",
    exact: true,
  }).click();
  await candidatePage.getByLabel("E-posta", { exact: true }).fill(
    candidateEmail,
  );
  await candidatePage.getByLabel("Şifre", { exact: true }).fill(
    candidatePassword,
  );
  await candidatePage.getByRole("button", {
    name: "Giriş yap",
    exact: true,
  }).click();
  await expect(candidatePage).toHaveURL(/\/dashboard$/);

  const taskOptionsResponsePromise = candidatePage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/tasks/options" &&
      response.request().method() === "GET",
  );
  const taskTagsResponsePromise = candidatePage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/tasks/tags" &&
      response.request().method() === "GET",
  );

  await candidatePage.getByRole("button", {
    name: "Görevler",
    exact: true,
  }).click();

  const [taskOptionsResponse, taskTagsResponse] = await Promise.all([
    taskOptionsResponsePromise,
    taskTagsResponsePromise,
  ]);
  const taskOptionsBody = await taskOptionsResponse.json();
  const taskTagsBody = await taskTagsResponse.json();

  expect(
    taskOptionsResponse.ok(),
    `Görev seçenekleri alınamadı: ${JSON.stringify(taskOptionsBody)}`,
  ).toBe(true);
  expect(
    taskTagsResponse.ok(),
    `Etiketler alınamadı: ${JSON.stringify(taskTagsBody)}`,
  ).toBe(true);

  const contractTaskType = taskOptionsBody.types?.find(
    (taskType) => taskType.name === "Sözleşme",
  );

  expect(
    contractTaskType,
    `Sözleşme görev tipi bulunamadı: ${JSON.stringify(taskOptionsBody.types)}`,
  ).toBeTruthy();

  const taskForm = candidatePage.locator("form.task-form");
  await expect(taskForm.getByRole("heading", {
    name: "Yeni görev oluştur",
  })).toBeVisible();
  await taskForm.getByLabel("Başlık", { exact: true }).fill(taskTitle);
  await taskForm.getByLabel("Açıklama", { exact: true }).fill(
    "Playwright ile gerçek kullanıcı akışında oluşturuldu.",
  );
  const taskTypeSelect = taskForm.getByRole("combobox", {
    name: "Görev tipi",
    exact: true,
  });
  const contractTaskTypeValue = String(contractTaskType.id);

  await taskTypeSelect.selectOption(contractTaskTypeValue);
  await expect(taskTypeSelect).toHaveValue(contractTaskTypeValue);
  await taskForm.getByRole("button", {
    name: "Görev oluştur",
    exact: true,
  }).click();
  await expect(candidatePage.getByRole("status").first()).toContainText(
    "Görev başarıyla oluşturuldu",
  );
  await expect(candidatePage.getByText(taskTitle, { exact: true }).first()).toBeVisible();
  await candidateContext.close();
});

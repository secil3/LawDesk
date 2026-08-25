const nodemailer = require("nodemailer");

let transporter;
let transporterKey;

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
};

const parsePort = (value) => {
  const port = Number.parseInt(value || "587", 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port");
  }

  return port;
};

const getEmailConfig = () => {
  const jsonTransport = parseBoolean(
    process.env.SMTP_JSON_TRANSPORT,
    process.env.NODE_ENV === "test",
  );
  const from = process.env.SMTP_FROM?.trim();
  const appBaseUrl = process.env.APP_BASE_URL?.trim();

  if (!from) {
    throw new Error("SMTP_FROM is required");
  }

  if (!appBaseUrl) {
    throw new Error("APP_BASE_URL is required");
  }

  let parsedBaseUrl;

  try {
    parsedBaseUrl = new URL(appBaseUrl);
  } catch {
    throw new Error("APP_BASE_URL must be a valid URL");
  }

  if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
    throw new Error("APP_BASE_URL must use http or https");
  }

  if (process.env.NODE_ENV === "production" && parsedBaseUrl.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use https in production");
  }

  if (jsonTransport) {
    return {
      appBaseUrl: parsedBaseUrl.toString(),
      from,
      jsonTransport: true,
    };
  }

  const host = process.env.SMTP_HOST?.trim();

  if (!host) {
    throw new Error("SMTP_HOST is required");
  }

  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const secure = parseBoolean(process.env.SMTP_SECURE);
  const requireTLS = parseBoolean(
    process.env.SMTP_REQUIRE_TLS,
    !secure,
  );

  if (process.env.NODE_ENV === "production" && !secure && !requireTLS) {
    throw new Error("SMTP encryption is required in production");
  }

  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be supplied together");
  }

  return {
    appBaseUrl: parsedBaseUrl.toString(),
    from,
    host,
    port: parsePort(process.env.SMTP_PORT),
    secure,
    requireTLS,
    auth: user ? { user, pass: password } : undefined,
    jsonTransport: false,
  };
};

const transportFor = (config) => {
  const key = JSON.stringify({
    jsonTransport: config.jsonTransport,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    user: config.auth?.user,
  });

  if (transporter && transporterKey === key) {
    return transporter;
  }

  transporter = config.jsonTransport
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTLS: config.requireTLS,
        auth: config.auth,
      });
  transporterKey = key;

  return transporter;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const activationUrlFor = (token, config = getEmailConfig()) => {
  const activationUrl = new URL("/activate", config.appBaseUrl);
  activationUrl.searchParams.set("token", token);
  return activationUrl.toString();
};

const sendActivationEmail = async ({
  to,
  name,
  token,
  expiresAt,
}) => {
  const config = getEmailConfig();
  const activationUrl = activationUrlFor(token, config);
  const expirationText = new Date(expiresAt).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  });
  const mailer = transportFor(config);

  return mailer.sendMail({
    from: config.from,
    to,
    subject: "LawDesk hesabınızı aktifleştirin",
    text:
      `Merhaba ${name},\n\n` +
      "LawDesk kayıt talebiniz onaylandı. Parolanızı belirlemek için " +
      `aşağıdaki tek kullanımlık bağlantıyı açın:\n\n${activationUrl}\n\n` +
      `Bağlantı ${expirationText} tarihine kadar geçerlidir.\n`,
    html:
      `<p>Merhaba ${escapeHtml(name)},</p>` +
      "<p>LawDesk kayıt talebiniz onaylandı. Parolanızı belirlemek için " +
      "aşağıdaki tek kullanımlık bağlantıyı açın.</p>" +
      `<p><a href="${escapeHtml(activationUrl)}">Hesabımı aktifleştir</a></p>` +
      `<p>Bağlantı ${escapeHtml(expirationText)} tarihine kadar geçerlidir.</p>`,
  });
};

const resetTransportForTests = () => {
  transporter = undefined;
  transporterKey = undefined;
};

module.exports = {
  activationUrlFor,
  getEmailConfig,
  resetTransportForTests,
  sendActivationEmail,
};

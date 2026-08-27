const dotenv = require("dotenv");

dotenv.config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const homeRoutes = require("./routes/home");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const groupsRoutes = require("./routes/groups");
const taskRoutes = require("./routes/tasks");
const searchRoutes = require("./routes/search");
const notificationRoutes = require("./routes/notifications");
const registrationRoutes = require("./routes/registration");
const { getAuthConfig } = require("./config/auth");
const { getHttpConfig, isOriginAllowed } = require("./config/http");
const {
  assertNoProductionPlaceholders,
} = require("./config/production");
const { getEmailConfig } = require("./services/emailService");
const {
  getEmailOutboxConfig,
} = require("./services/emailOutboxService");

const app = express();

// Uygulama başlarken authentication ayarlarını doğrular.
getAuthConfig();
const httpConfig = getHttpConfig();

if (process.env.NODE_ENV === "production") {
  // Aktivasyon e-postası zorunlu olduğundan eksik SMTP ayarıyla servis açılmaz.
  getEmailConfig();
  getEmailOutboxConfig();
  assertNoProductionPlaceholders();
}

if (httpConfig.trustProxyHops > 0) {
  app.set("trust proxy", httpConfig.trustProxyHops);
}

app.disable("x-powered-by");
app.use(
  helmet({
    // API yanıtları HTML çalıştırmadığı için CSP, arayüzü sunan Nginx'te uygulanır.
    contentSecurityPolicy: false,
    strictTransportSecurity:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      callback(
        null,
        isOriginAllowed(origin, httpConfig.allowedOrigins),
      );
    },
    credentials: true,
  }),
);
app.use((req, res, next) => {
  if (
    !isOriginAllowed(
      req.get("origin"),
      httpConfig.allowedOrigins,
    )
  ) {
    return res.status(403).json({
      error: "İstek kaynağına izin verilmiyor",
    });
  }

  return next();
});
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({
    message: "LawDesk Backend is Running",
  });
});

app.use("/api", homeRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/registration-requests", registrationRoutes);

module.exports = app;

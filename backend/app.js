const dotenv = require("dotenv");

dotenv.config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const homeRoutes = require("./routes/home");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const groupsRoutes = require("./routes/groups");
const taskRoutes = require("./routes/tasks");
const searchRoutes = require("./routes/search");
const notificationRoutes = require("./routes/notifications");
const registrationRoutes = require("./routes/registration");
const { getAuthConfig } = require("./config/auth");

const app = express();

// Uygulama başlarken authentication ayarlarını doğrular.
getAuthConfig();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
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

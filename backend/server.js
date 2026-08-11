const dotenv = require("dotenv");

dotenv.config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const homeRoutes = require("./routes/home");
const authRoutes = require("./routes/auth");
const { getAuthConfig } = require("./config/auth");

const app = express();
const PORT = process.env.PORT || 3001;

// Uygulama başlarken authentication ayarlarını doğrular.
getAuthConfig();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({
    message: "LawDesk Backend is Running",
  });
});

app.use("/api", homeRoutes);
app.use("/api/auth", authRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
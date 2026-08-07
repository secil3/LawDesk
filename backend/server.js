const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const homeRoutes = require("./routes/home");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "LawDesk Backend is Running" });
});

app.use("/api", homeRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

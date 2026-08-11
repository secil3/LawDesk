const db = require("../config/db");

exports.getRoot = (req, res) => {
  res.json({ message: "LawDesk Backend is Running" });
};

exports.testDbConnection = async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    await db.testConnection();

    return res.json({
      message: "Database connection successful",
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    return res.status(500).json({
      error: "Database connection failed",
    });
  }
};
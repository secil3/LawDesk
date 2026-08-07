const db = require("../config/db");

exports.getRoot = (req, res) => {
  res.json({ message: "LawDesk Backend is Running" });
};

exports.testDbConnection = async (req, res) => {
  try {
    await db.testConnection();
    res.json({ message: "Database connection successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database connection failed", details: error.message });
  }
};

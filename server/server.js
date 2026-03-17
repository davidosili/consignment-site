require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Route & Model Imports
const notifyRoutes = require("./routes/notifyRoutes");
const telegramNotify = require("./routes/telegramNotify");
const Tracking = require("./models/Tracking");
const Admin = require("./models/Admin");
const TempShipment = require("./models/TempShipment");
const { bot } = require('./telegramBot');

const app = express();

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================
app.use(express.json());

const allowedOrigins = [
  "http://localhost:5000",
  "https://consignment-site.vercel.app",
  "https://rapidroutesltd.com",
  "https://www.rapidroutesltd.com",
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `CORS policy: This origin is not allowed: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// ==========================================
// 2. DATABASE CONNECTION
// ==========================================
const MONGO_URI = process.env.MONGO_URI;
const SECRET = process.env.SECRET;
const BASE_URL = process.env.BASE_URL || "https://www.rapidroutesltd.com";

if (!MONGO_URI || !SECRET) {
  console.error("❌ CRITICAL: MONGO_URI or SECRET is missing!");
} else {
  mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err.message));
}

// ==========================================
// 3. AUTH MIDDLEWARE
// ==========================================
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.adminId = decoded.id;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// ==========================================
// 4. ROUTES
// ==========================================
app.use("/api/notify/telegram", telegramNotify);
app.use("/api/notify", notifyRoutes);

// =====================
// Telegram bot webhook
// =====================
if(process.env.TELEGRAM_BOT_TOKEN) {
  const webhookPath = `/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  app.post(webhookPath, async (req, res) => {
    try {
      await bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (err) {
      console.error("❌ Telegram webhook error:", err);
      res.sendStatus(500);
    }
  });
}

// --- PUBLIC TRACKING ---
app.get("/api/tracking/:trackingNumber", async (req, res) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const record = await Tracking.findOne({ trackingNumber });

    if (!record) return res.status(404).json({ message: "Sorry, parcel not yet collected." });

    res.json({
      trackingNumber: record.trackingNumber,
      sender: record.sender,
      receiver: record.receiver,
      origin: record.origin,
      destination: record.destination,
      location: record.location,
      status: record.status,
      expectedDelivery: record.expectedDelivery,
      createdAt: record.createdAt,
      updates: record.updates || [],
      items: record.items || []
    });
  } catch (err) {
    console.error("Lookup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- ADMIN AUTH ---
app.post("/api/admin/signup", async (req, res) => { /* unchanged */ });
app.post("/api/admin/login", async (req, res) => { /* unchanged */ });

// --- ADMIN ROUTES ---
app.get("/api/admin/tracking", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.post("/api/admin/tracking", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.put("/api/admin/tracking/number/:trackingNumber", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.put("/api/admin/tracking/delivery/:trackingNumber", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.delete("/api/admin/tracking/:id", authMiddleware, async (req,res)=>{ /* unchanged */ });

app.get("/api/admin/pending-shipments", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.delete("/api/admin/reject-shipment/:id", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.post("/api/admin/approve-shipment/:id", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.post("/api/receiver/submit/:id", async (req,res)=>{ /* unchanged */ });
app.post("/api/admin/shipment-link", authMiddleware, async (req,res)=>{ /* unchanged */ });
app.post("/api/contact", async (req,res)=>{ /* unchanged */ });

// ==========================================
// 5. STATIC FILES
// ==========================================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/landing.html")));
app.use(express.static(path.join(__dirname, "../public")));
app.get("/ping", (req, res) => res.send("pong"));

// ==========================================
// 6. START SERVER (ONLY LOCAL)
// ==========================================
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

// ==========================================
// 7. EXPORT APP (FOR VERCEL)
// ==========================================
module.exports = app;

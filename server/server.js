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
const telegramNotify = require('./routes/telegramNotify');
const Tracking = require("./models/Tracking");
const Admin = require("./models/Admin");
const TempShipment = require("./models/TempShipment");
const { bot } = require('./telegramBot');

const app = express();

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================
app.use(express.json());

// CORS
const allowedOrigins = [
  "http://localhost:5000",
  "https://consignment-site.vercel.app",
  "https://rapidroutesltd.com",
  "https://www.rapidroutesltd.com",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error(`CORS policy: This origin is not allowed: ${origin}`), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// ==========================================
// 2. MONGODB CONNECTION CACHING (Vercel-Friendly)
// ==========================================
let cachedDb = null;
async function connectToDB() {
  if (cachedDb) return cachedDb;
  cachedDb = await mongoose.connect(process.env.MONGO_URI);
  return cachedDb;
}

// ==========================================
// 3. AUTH MIDDLEWARE
// ==========================================
const SECRET = process.env.SECRET;
const BASE_URL = process.env.BASE_URL || "https://www.rapidroutesltd.com";

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

// Telegram bot webhook (non-blocking)
app.use('/api/notify/telegram', telegramNotify);
if (process.env.TELEGRAM_BOT_TOKEN) {
  app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body); // async, do not await
    res.status(200).send("OK");
  });
}

app.use("/api/notify", notifyRoutes);

// --- PUBLIC TRACKING ---
app.get("/api/tracking/:trackingNumber", async (req, res) => {
  try {
    await connectToDB();
    const record = await Tracking.findOne({ trackingNumber: req.params.trackingNumber });
    if (!record) return res.status(404).json({ message: "Parcel not yet collected." });
    res.json(record);
  } catch (err) {
    console.error("Lookup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- ADMIN AUTH ---
app.post("/api/admin/signup", async (req, res) => {
  try {
    await connectToDB();
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    const existing = await Admin.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.create({ username, password: hashedPassword });
    res.json({ message: "Admin account created successfully" });
  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    await connectToDB();
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: admin._id }, SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// --- ADMIN TRACKING ROUTES ---
app.get("/api/admin/tracking", authMiddleware, async (req, res) => {
  try {
    await connectToDB();
    const entries = await Tracking.find().sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tracking" });
  }
});

// All other admin routes (create/update/delete tracking, approve shipment, etc.) 
// should call `await connectToDB()` at the top and send emails asynchronously, 
// e.g.:
// res.json({ message: "Shipment approved" });
// transporter.sendMail(mailOptions).catch(console.error);

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/landing.html")));
app.get("/ping", (req, res) => res.send("pong"));

// ==========================================
// 5. EXPORT APP FOR VERCEL
// ==========================================
module.exports = app;

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
const TelegramUser = require('./models/TelegramUser'); 
const { bot, sendMessageToUser } = require('./telegramBot');

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
    .catch(err => console.error("❌ MongoDB connection error:", err.message));
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
app.use('/api/notify/telegram', telegramNotify);
if(process.env.TELEGRAM_BOT_TOKEN) {
  app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

app.use("/api/notify", notifyRoutes);

// --- PUBLIC TRACKING ROUTE ---
app.get("/api/tracking/:trackingNumber", async (req, res) => {
  try {
    const record = await Tracking.findOne({ trackingNumber: req.params.trackingNumber });
    if (!record) return res.status(404).json({ message: "Parcel not yet collected." });

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
app.post("/api/admin/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existing = await Admin.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ username, password: hashedPassword });
    await newAdmin.save();

    res.json({ message: "Admin account created successfully" });
  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
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

// --- RECEIVER SUBMIT ROUTE (UPDATED) ---
app.post("/api/receiver/submit/:id", async (req, res) => {
  try {
    const temp = await TempShipment.findOne({ tempId: req.params.id });
    if (!temp) return res.status(404).json({ error: "Invalid link" });

    temp.receiver = req.body.receiver;
    temp.status = "Awaiting Admin Approval";
    await temp.save();
    console.log("🔹 TempShipment updated:", temp);

    const { name, email, phone, address } = req.body.receiver || {};
    const tempId = req.params.id;

    const adminMsg = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email || "N/A"}
📞 Phone: ${phone || "N/A"}
🏠 Address: ${address || "N/A"}
🆔 Temp ID: ${tempId}`;

    // Notify admin
    try {
      if (process.env.TELEGRAM_ADMIN_ID) {
        await bot.sendMessage(parseInt(process.env.TELEGRAM_ADMIN_ID, 10), adminMsg);
        console.log("✅ Admin notified via Telegram");
      }
    } catch (err) {
      console.warn("⚠️ Telegram admin notification failed:", err.message);
    }

    // Notify sender
    const telegramUser = await TelegramUser.findOne({ tempId });
    if (telegramUser?.chatId) {
      try {
        await sendMessageToUser(tempId,
          `👋 Hi ${name}! We’ve received your delivery details. Our team will reach out soon regarding your parcel (Temp ID: ${tempId}).`
        );
        console.log("✅ Sender notified via Telegram");
      } catch (err) {
        console.warn("⚠️ Telegram message to sender failed:", err.message);
      }
    } else if (email) {
      // Fallback email if Telegram not linked
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp-relay.brevo.com",
          port: 587,
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        await transporter.sendMail({
          from: `"Rapid Route Courier" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: "📦 Receiver Info Received",
          html: `<p>Hi ${name},</p>
                 <p>We have received your delivery details. Our team will contact you soon regarding your parcel (Temp ID: ${tempId}).</p>`
        });
        console.log("✅ Sender notified via email (fallback)");
      } catch (err) {
        console.warn("⚠️ Email notification to sender failed:", err.message);
      }
    }

    res.json({ success: true, message: "Receiver info submitted. Admin notified." });
  } catch (err) {
    console.error("❌ Receiver submit error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- SHIPMENT LINK CREATION ---
app.post("/api/admin/shipment-link", authMiddleware, async (req, res) => {
  try {
    const { sender, items } = req.body;
    if (!sender?.name) return res.status(400).json({ error: "Sender name is required." });

    const itemArray = Array.isArray(items)
      ? items.map((it, idx) => ({
          description: it.description || `Item ${idx+1}`,
          weight: it.weight || "",
          cost: it.cost || "0",
          quantity: it.quantity || 1
        }))
      : req.body.item ? [{ description: req.body.item.description || "", weight: req.body.item.weight || "", cost: req.body.item.cost || "0", quantity: req.body.item.quantity || 1 }]
      : [];

    if (!itemArray.length) return res.status(400).json({ error: "At least one item is required." });

    const tempId = "TMP-" + Math.random().toString(36).substring(2,10).toUpperCase();
    const newTemp = new TempShipment({ tempId, sender, items: itemArray, status: "Pending Receiver Info" });
    await newTemp.save();
    res.json({ tempId });
  } catch (err) {
    res.status(500).json({ error: "Server error creating shipment link" });
  }
});

// --- CONTACT FORM ---
app.post("/api/contact", async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) return res.status(400).json({ error: "All fields are required" });

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"Rapid Route Courier" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER,
      subject: `📬 Contact Form: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nMessage:\n${message}`
    });
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ==========================================
// 5. STATIC FILES
// ==========================================
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/landing.html")));
app.get("/ping", (req,res) => res.send("pong"));

// ==========================================
// 6. START SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

// Export for Vercel
module.exports = app;

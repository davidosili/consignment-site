require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Routes & Models
const notifyRoutes = require("./routes/notifyRoutes");
const telegramNotify = require("./routes/telegramNotify"); // Telegram notifications
const Tracking = require("./models/Tracking");
const Admin = require("./models/Admin");
const TempShipment = require("./models/TempShipment");
const { bot } = require("./telegramBot");

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

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (!allowedOrigins.includes(origin)) {
        return callback(new Error(`CORS blocked: ${origin}`), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// ==========================================
// 2. DB CONNECTION (CACHED)
// ==========================================
let cachedDb = null;
async function connectToDB() {
  if (cachedDb) return cachedDb;
  cachedDb = await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB connected");
  return cachedDb;
}

// ==========================================
// 3. AUTH
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
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
};

// ==========================================
// 4. ROUTES
// ==========================================

// Telegram webhook
app.use("/api/notify/telegram", telegramNotify);

if (process.env.TELEGRAM_BOT_TOKEN) {
  // 1. Create a clean, safe path without colons!
  const webhookPath = `/api/telegram-webhook-secure`; 
  const webhookUrl = `${BASE_URL}${webhookPath}`;
  
  bot.setWebHook(webhookUrl)
    .then(() => console.log(`✅ Telegram Webhook successfully set to: ${webhookUrl}`))
    .catch(err => console.error("❌ Failed to set Telegram webhook:", err));

  // 2. Catch the messages using the clean path
  app.post(webhookPath, async (req, res) => {
    console.log("🔔 TELEGRAM KNOCKING! Message:", JSON.stringify(req.body.message));
    
    try {
      // Add 'await' so Vercel does not kill the server before the bot sends the message!
      await bot.processUpdate(req.body); 
    } catch (error) {
      console.error("Bot Error:", error);
    }
    
    // ONLY send 200 after the bot has fully finished talking
    res.sendStatus(200);
  });
}

app.use("/api/notify", notifyRoutes);

// -------- PUBLIC TRACKING --------
app.get("/api/tracking/:trackingNumber", async (req, res) => {
  try {
    await connectToDB();
    const record = await Tracking.findOne({ trackingNumber: req.params.trackingNumber });
    if (!record) return res.status(404).json({ message: "Parcel not found" });
    res.json(record);
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// -------- ADMIN AUTH --------
app.post("/api/admin/signup", async (req, res) => {
  try {
    await connectToDB();
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    const exists = await Admin.findOne({ username });
    if (exists) return res.status(400).json({ error: "Exists" });

    const hash = await bcrypt.hash(password, 10);
    await Admin.create({ username, password: hash });

    res.json({ message: "Created" });
  } catch {
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    await connectToDB();
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: "Invalid" });

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: "Invalid" });

    const token = jwt.sign({ id: admin._id }, SECRET, { expiresIn: "1h" });
    res.json({ token });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// -------- ADMIN TRACKING (GET) --------
app.get("/api/admin/tracking", authMiddleware, async (req, res) => {
  try {
    await connectToDB();
    const data = await Tracking.find().sort({ createdAt: -1 });
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});


// -------- UPDATE EXPECTED DELIVERY --------
app.put("/api/admin/tracking/delivery/:trackingNumber", authMiddleware, async (req, res) => {
  try {
    await connectToDB();
    const { expectedDelivery } = req.body;
    
    const updated = await Tracking.findOneAndUpdate(
      { trackingNumber: req.params.trackingNumber },
      { expectedDelivery },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Tracking number not found" });
    
    res.json(updated);
  } catch (err) {
    console.error("Update delivery error:", err);
    res.status(500).json({ error: "Failed to update delivery date" });
  }
});

// -------- UPDATE STATUS & LOCATION --------
app.put("/api/admin/tracking/number/:trackingNumber", authMiddleware, async (req, res) => {
  try {
    await connectToDB();
    const { status, location } = req.body;
    
    const updated = await Tracking.findOneAndUpdate(
      { trackingNumber: req.params.trackingNumber },
      { 
        status, 
        location,
        // This automatically adds a new timestamped update to the package history!
        $push: { updates: { status, location, timestamp: new Date() } } 
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Tracking number not found" });
    
    res.json(updated);
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});


// -------- CREATE DIRECT TRACKING (POST) --------
app.post("/api/admin/tracking", authMiddleware, async (req, res) => {
  try {
    await connectToDB();

    // SAFETY FALLBACK: Ensure all items have an itemId and name
    const safeItems = (req.body.items || []).map((item, index) => {
      return {
        ...item,
        itemId: item.itemId || "ITEM-" + crypto.randomUUID().slice(0, 8),
        name: item.name || `Item ${index + 1}`
      };
    });

    // Create the tracking document
    const newTracking = await Tracking.create({
      sender: req.body.sender,
      receiver: req.body.receiver,
      origin: req.body.origin || req.body.sender?.address || "Unknown",
      destination: req.body.destination || req.body.receiver?.address || "Unknown",
      location: req.body.location || "Warehouse",
      status: req.body.status || "Pending",
      expectedDelivery: req.body.expectedDelivery,
      items: safeItems, 
      updates: [{ 
        status: req.body.status || "Created", 
        location: req.body.location || "Warehouse",
        timestamp: new Date() 
      }],
    });

    res.status(201).json(newTracking);
  } catch (err) {
    console.error("Error creating direct tracking:", err);
    res.status(500).json({ error: "Failed to create tracking entry" });
  }
});

// -------- PENDING SHIPMENTS --------
app.get("/api/admin/pending-shipments", authMiddleware, async (req, res) => {
  try {
    await connectToDB();
    const shipments = await TempShipment.find().sort({ createdAt: -1 });
    res.json(shipments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch pending shipments" });
  }
});

// -------- APPROVE SHIPMENT --------
app.post("/api/admin/approve-shipment/:id", authMiddleware, async (req, res) => {
  try {
    await connectToDB();

    const temp = await TempShipment.findById(req.params.id);
    if (!temp) return res.status(404).json({ error: "Not found" });

    // SAFETY FALLBACK: Ensure all items have an itemId AND a name so Mongoose doesn't crash on old data
    const safeItems = (temp.items || []).map((item, index) => {
      // If it's a mongoose subdocument, convert it to a standard object first
      const itemObj = item.toObject ? item.toObject() : item;
      return {
        ...itemObj,
        itemId: itemObj.itemId || "ITEM-" + crypto.randomUUID().slice(0, 8),
        name: itemObj.name || `Item ${index + 1}` // <-- ADDED THIS: Fallback name if missing
      };
    });

    const tracking = await Tracking.create({
      sender: temp.sender,
      receiver: temp.receiver,
      origin: temp.origin || temp.sender?.address || "Unknown",
      destination: temp.destination || temp.receiver?.address || "Unknown",
      location: "Warehouse",
      status: "Pending",
      items: safeItems, // <-- FIXED: Items are now transferred over
      updates: [{ status: "Created", timestamp: new Date() }],
    });

    res.json({ message: "Approved", trackingNumber: tracking.trackingNumber });

    // Non-blocking email
    if (temp.receiver?.email) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      transporter
        .sendMail({
          from: process.env.EMAIL_USER,
          to: temp.receiver.email,
          subject: "Shipment Approved",
          html: `<p>Tracking: ${tracking.trackingNumber}</p>`,
        })
        .catch(console.error);
    }

    await TempShipment.findByIdAndDelete(temp._id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Approval failed" });
  }
});

// -------- REJECT --------
app.delete("/api/admin/reject-shipment/:id", authMiddleware, async (req, res) => {
  try {
    await connectToDB();
    await TempShipment.findByIdAndDelete(req.params.id);
    res.json({ message: "Rejected" });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// -------- DELETE TRACKING ENTRY --------
app.delete("/api/admin/tracking/:id", authMiddleware, async (req, res) => {
  try {
    await connectToDB();
    
    // Find the tracking entry by its MongoDB ID and delete it
    const deleted = await Tracking.findByIdAndDelete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Tracking entry not found" });
    }
    
    res.json({ message: "Tracking entry deleted successfully" });
  } catch (err) {
    console.error("Delete tracking error:", err);
    res.status(500).json({ error: "Failed to delete tracking entry" });
  }
});


// -------- CREATE SHIPMENT LINK --------
app.post("/api/admin/shipment-link", authMiddleware, async (req, res) => {
  try {
    await connectToDB();

    const tempId = "TMP-" + crypto.randomUUID().slice(0, 8);

    await TempShipment.create({
      tempId,
      sender: req.body.sender,
      items: req.body.items || [],
      origin: req.body.origin,           // <-- FIXED: Save origin
      destination: req.body.destination, // <-- FIXED: Save destination
      status: "Pending Receiver Info",
    });

    res.json({ tempId });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// -------- RECEIVER SUBMIT --------
app.post("/api/receiver/submit/:id", async (req, res) => {
  try {
    await connectToDB();

    const temp = await TempShipment.findOne({ tempId: req.params.id });
    if (!temp) return res.status(404).json({ error: "Invalid link" });

    temp.receiver = req.body.receiver;
    temp.status = "Awaiting Admin Approval";
    await temp.save();

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// ==========================================
// STATIC
// ==========================================
app.use(express.static(path.join(__dirname, "../public")));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/landing.html"))
);

app.get("/ping", (req, res) => res.send("pong"));

module.exports = app;


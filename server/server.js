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
const { bot, sendMessageToUser } = require('./telegramBot'); // <-- updated import
const TelegramUser = require('./models/TelegramUser'); // <-- added import

const app = express();

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================
app.use(express.json());

// CORS Configuration
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
    .catch((err) => {
      console.error("❌ MongoDB connection error:", err.message);
    });
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

// --- PUBLIC ROUTES ---
app.get("/api/tracking/:trackingNumber", async (req, res) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const record = await Tracking.findOne({ trackingNumber });

    if (!record) {
      return res.status(404).json({ message: "Sorry, parcel not yet collected." });
    }

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

// --- ADMIN-ONLY ROUTES ---
app.post("/api/admin/tracking", authMiddleware, async (req, res) => {
  try {
    const { sender, receiver, origin, destination, location, expectedDelivery, status, items } = req.body;
    const newTracking = new Tracking({
      sender, receiver, origin, destination, location, expectedDelivery,
      status: status || "Collected",
      items: items || [],
      updates: [{ location: location || "Warehouse", status: status || "Collected", timestamp: new Date() }]
    });

    await newTracking.save();
    res.status(201).json(newTracking);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: "Tracking number already exists." });
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/admin/tracking/number/:trackingNumber", authMiddleware, async (req, res) => {
  try {
    const { status, location } = req.body;
    const updated = await Tracking.findOneAndUpdate(
      { trackingNumber: req.params.trackingNumber },
      {
        $set: { status, location },
        $push: { updates: { location: location || "Unknown", status: status || "Updated", timestamp: new Date() } }
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Tracking not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

app.put("/api/admin/tracking/delivery/:trackingNumber", authMiddleware, async (req, res) => {
  try {
    const { expectedDelivery } = req.body;
    if (!expectedDelivery) return res.status(400).json({ error: "Expected delivery date is required." });

    const updated = await Tracking.findOneAndUpdate(
      { trackingNumber: req.params.trackingNumber },
      { $set: { expectedDelivery: new Date(expectedDelivery) } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Tracking not found" });
    res.json({ message: "Expected delivery date updated successfully", updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update expected delivery" });
  }
});

app.get("/api/admin/tracking", authMiddleware, async (req, res) => {
  const entries = await Tracking.find().sort({ createdAt: -1 });
  res.json(entries);
});

app.delete("/api/admin/tracking/:id", authMiddleware, async (req, res) => {
  await Tracking.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted successfully" });
});

// --- SHIPMENT ROUTES ---
app.get("/api/admin/pending-shipments", authMiddleware, async (req, res) => {
  const shipments = await TempShipment.find().sort({ createdAt: -1 });
  res.json(shipments);
});

app.delete("/api/admin/reject-shipment/:id", authMiddleware, async (req, res) => {
  await TempShipment.findByIdAndDelete(req.params.id);
  res.json({ message: "Rejected successfully" });
});

app.post("/api/admin/approve-shipment/:id", authMiddleware, async (req, res) => {
  try {
    const temp = await TempShipment.findById(req.params.id);
    if (!temp) return res.status(404).json({ error: "Temp shipment not found" });

    const itemsData = (temp.items || []).map((it) => ({
      itemId: "TEMP-" + crypto.randomUUID(),
      name: it.description || "Unnamed Item",
      description: it.description || "",
      weight: it.weight || "0",
      cost: it.cost || "0",
      quantity: it.quantity || 1,
    }));

    const newTracking = await Tracking.create({
      sender: temp.sender,
      receiver: temp.receiver,
      origin: temp.sender?.address || "Unknown",
      destination: temp.receiver?.address || "Unknown",
      location: temp.sender?.address || "Warehouse",
      expectedDelivery: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: "Pending",
      items: itemsData,
      updates: [{ status: "Created", timestamp: new Date(), location: temp.sender?.address || "Warehouse" }],
    });

    if (temp.receiver?.email) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      const mailOptions = {
        from: `"Rapid Route Courier" <${process.env.EMAIL_USER}>`,
        to: temp.receiver.email,
        subject: "📦 Your Shipment Has Been Approved",
        html: `
          <h2>Dear ${temp.receiver.name || "Customer"},</h2>
          <p>Your shipment has been approved and is now being processed.</p>
          <p><b>Tracking Number:</b> ${newTracking.trackingNumber}</p>
          <p><b>Origin:</b> ${newTracking.origin}</p>
          <p><b>Destination:</b> ${newTracking.destination}</p>
          <p>You can track your shipment anytime at:</p>
          <a href="${BASE_URL}/tracking.html?num=${newTracking.trackingNumber}">Track Package</a>
          <br><br>
          <p>Thank you for choosing <b>Rapid Route Courier</b>!</p>
        `,
      };
      await transporter.sendMail(mailOptions);
    }

    await TempShipment.findByIdAndDelete(temp._id);
    res.json({ message: "Shipment approved and email sent", trackingNumber: newTracking.trackingNumber });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve shipment" });
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

    // --- Telegram notification ---
    const { name, email, phone, address } = req.body.receiver || {};
    const tempId = req.params.id;

    const msgToAdmin = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email || "N/A"}
📞 Phone: ${phone || "N/A"}
🏠 Address: ${address || "N/A"}
🆔 Temp ID: ${tempId}`;

    try {
      console.log("🔹 Sending message to admin...");
      await bot.sendMessage(parseInt(process.env.TELEGRAM_ADMIN_ID, 10), msgToAdmin);
      console.log("✅ Message sent to admin");

      const user = await TelegramUser.findOne({ tempId });
      if (user) {
        console.log("🔹 Sending message to user...");
        await sendMessageToUser(tempId,
          `👋 Hi ${name}! We’ve received your delivery details.\nOur team will reach out soon regarding your parcel (Temp ID: ${tempId}).`
        );
        console.log("✅ Message sent to user");
      } else {
        console.log(`⚠️ User not linked yet for Temp ID: ${tempId}`);
      }
    } catch (err) {
      console.error("❌ Telegram notification error:", err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Receiver submit error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/shipment-link", authMiddleware, async (req, res) => {
  try {
    const { sender, items } = req.body;
    if (!sender?.name) return res.status(400).json({ error: "Sender name is required." });

    let itemArray = [];
    if (Array.isArray(items)) {
      itemArray = items.map((it, idx) => ({
        description: it.description || `Item ${idx + 1}`,
        weight: it.weight || "",
        cost: it.cost || "0",
        quantity: it.quantity || 1,
      }));
    } else if (req.body.item) {
      itemArray = [{ description: req.body.item.description || "", weight: req.body.item.weight || "", cost: req.body.item.cost || "0", quantity: req.body.item.quantity || 1 }];
    } else {
      return res.status(400).json({ error: "At least one item is required." });
    }

    const tempId = "TMP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
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

    const mailOptions = {
      from: `"Rapid Route Courier" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER,
      subject: `📬 Contact Form: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nMessage:\n${message}`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ==========================================
// 5. STATIC FILES
// ==========================================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/landing.html")));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/ping", (req, res) => res.send("pong"));

// ==========================================
// 6. START SERVER (UPDATED FOR VERCEL)
// ==========================================
const PORT = process.env.PORT || 5000;

// Only listen if not running as a Vercel serverless function
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

// THIS IS REQUIRED FOR VERCEL
module.exports = app;

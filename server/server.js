require("dotenv").config();
const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");
const notifyRoutes = require("./routes/notifyRoutes"); // ✅
const telegramNotify = require('./routes/telegramNotify');



const Tracking = require("./models/Tracking.js");
const Admin = require("./models/Admin.js");

const app = express();
app.use(express.json());
app.use('/api/notify/telegram', telegramNotify);

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// CORS allowed origins
const allowedOrigins = [
  "http://localhost:5000",
  "https://rapidroutesltd.onrender.com", // Render domain (still valid fallback)
  "https://rapidroutesltd.com",   
  "https://www.rapidroutesltd.com",// ✅ Your custom domain
];


app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin like mobile apps or Postman
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `CORS policy: This origin is not allowed: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
}));

app.use("/api/notify", notifyRoutes);

const { bot } = require('./telegramBot');
app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI;
const SECRET = process.env.SECRET;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing in .env");
  process.exit(1);
}

if (!SECRET) {
  console.error("❌ SECRET is missing in .env");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});


// Middleware to protect admin routes
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1]; // Bearer <token>
  try {
    const decoded = jwt.verify(token, SECRET);
    req.adminId = decoded.id;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// ---------------- PUBLIC ROUTES ----------------

// User tracking lookup
app.get("/api/tracking/:trackingNumber", async (req, res) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const record = await Tracking.findOne({ trackingNumber });

    if (!record) {
      return res.status(404).json({ message: "Sorry, parcel not yet collected." });
    }

    // Respond with correct structure
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
      items: record.items || [] // ✅ include items
    });

  } catch (err) {
    console.error("Lookup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// ---------------- ADMIN AUTH ----------------

// Signup 
app.post("/api/admin/signup", async (req, res) => {
  const { username, password } = req.body;

  const existing = await Admin.findOne({ username });
  if (existing) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newAdmin = new Admin({ username, password: hashedPassword });
  await newAdmin.save();

  res.json({ message: "Admin account created successfully" });
});

// Login
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: admin._id }, SECRET, { expiresIn: "1h" });

  res.json({ message: "Login successful", token });
});

// ---------------- ADMIN-ONLY ROUTES ----------------
app.post("/api/admin/tracking", authMiddleware, async (req, res) => {
  try {
    const {
      sender,
      receiver,
      origin,
      destination,
      location,
      expectedDelivery,
      status,
      items 
    } = req.body;

    const newTracking = new Tracking({
      sender,
      receiver,
      origin,
      destination,
      location,
      expectedDelivery,
      status: status || "Collected",
      items: items || [], // <-- saves items
      updates: [
        {
          location: location || "Warehouse",
          status: status || "Collected",
          timestamp: new Date()
        }
      ]
    });

    await newTracking.save();
    res.status(201).json(newTracking);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Tracking number already exists. Please retry." });
    }
    console.error("Create error:", err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ Update tracking status
app.put("/api/admin/tracking/number/:trackingNumber", authMiddleware, async (req, res) => {
  try {
    const { status, location } = req.body;

    const updated = await Tracking.findOneAndUpdate(
      { trackingNumber: req.params.trackingNumber },
      {
        $set: {
          status,
          location
        },
        $push: {
          updates: {
            location: location || "Unknown",
            status: status || "Updated",
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Tracking not found" });
    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Get all tracking entries
app.get("/api/admin/tracking", authMiddleware, async (req, res) => {
  const entries = await Tracking.find().sort({ createdAt: -1 });
  res.json(entries);
});

// Delete a tracking entry
app.delete("/api/admin/tracking/:id", authMiddleware, async (req, res) => {
  await Tracking.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted successfully" });
});

const crypto = require("crypto");
const TempShipment = require("./models/TempShipment");

// Fetch pending shipments
app.get("/api/admin/pending-shipments", authMiddleware, async (req, res) => {
  const shipments = await TempShipment.find().sort({ createdAt: -1 });
  res.json(shipments);
});

// Reject shipment
app.delete("/api/admin/reject-shipment/:id", authMiddleware, async (req, res) => {
  await TempShipment.findByIdAndDelete(req.params.id);
  res.json({ message: "Rejected successfully" });
});

// Approve shipment → convert TempShipment → Tracking
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

    // ✅ Create new tracking record
    const newTracking = await Tracking.create({
      sender: temp.sender,
      receiver: temp.receiver,
      origin: temp.sender?.address || "Unknown",
      destination: temp.receiver?.address || "Unknown",
      location: temp.sender?.address || "Warehouse",
      expectedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      status: "Pending",
      items: itemsData,
      updates: [
        {
          status: "Created",
          timestamp: new Date(),
          location: temp.sender?.address || "Warehouse",
        },
      ],
    });

    // ✅ Send tracking email to receiver
    if (temp.receiver?.email) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
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
          <a href="${BASE_URL}/tracking.html?num=${newTracking.trackingNumber}">
            Track Package
          </a>
          <br><br>
          <p>Thank you for choosing <b>Rapid Route Courier</b>!</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Email sent to ${temp.receiver.email}`);
    }

    // Delete temp shipment
    await TempShipment.findByIdAndDelete(temp._id);

    res.json({
      message: "Shipment approved and email sent",
      trackingNumber: newTracking.trackingNumber,
    });
  } catch (err) {
    console.error("Approve shipment error:", err);
    res.status(500).json({ error: "Failed to approve shipment" });
  }
});

// POST /api/receiver/submit/:id
app.post("/api/receiver/submit/:id", async (req, res) => {
  try {
    const temp = await TempShipment.findOne({ tempId: req.params.id });
    if (!temp) return res.status(404).json({ error: "Invalid link" });

    temp.receiver = req.body.receiver;
    temp.status = "Awaiting Admin Approval";
    await temp.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Receiver submit error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------ CREATE TEMP SHIPMENT LINK (MULTI-ITEM SUPPORT) ------------------
app.post("/api/admin/shipment-link", authMiddleware, async (req, res) => {
  try {
    const { sender, items } = req.body;

    // Validate sender
    if (!sender?.name) {
      return res.status(400).json({ error: "Sender name is required." });
    }

    // Validate and normalize items
    let itemArray = [];
    if (Array.isArray(items)) {
      itemArray = items.map((it, idx) => ({
        description: it.description || `Item ${idx + 1}`,
        weight: it.weight || "",
        cost: it.cost || "0",
        quantity: it.quantity || 1,
      }));
    } else if (req.body.item) {
      // fallback for single item (old requests)
      itemArray = [
        {
          description: req.body.item.description || "",
          weight: req.body.item.weight || "",
          cost: req.body.item.cost || "0",
          quantity: req.body.item.quantity || 1,
        },
      ];
    } else {
      return res.status(400).json({ error: "At least one item is required." });
    }

    // Generate unique temp ID
    const tempId = "TMP-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    // Save temporary shipment
    const newTemp = new TempShipment({
      tempId,
      sender,
      items: itemArray,
      status: "Pending Receiver Info",
    });

    await newTemp.save();

    res.json({ tempId });
  } catch (err) {
    console.error("Error creating shipment link:", err);
    res.status(500).json({ error: "Server error creating shipment link" });
  }
});

// ------------------ CONTACT FORM ROUTE ------------------
app.post("/api/contact", async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Rapid Route Courier" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER,
      subject: `📬 Contact Form: ${subject}`,
      text: `
Name: ${name}
Email: ${email}
Message:
${message}
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Message sent successfully!" });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ---------------- SERVE FRONTEND ----------------

// Serve landing.html as the default page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/landing.html"));
});

// Then serve everything inside /public folder (for JS, CSS, images, etc.)
app.use(express.static(path.join(__dirname, "../public")));


app.get("/ping", (req, res) => res.send("pong"));

// Use your Render URL here
const SELF_URL = "https://rapidroutesltd.onrender.com/ping";

setInterval(() => {
  axios.get(SELF_URL)
    .then(() => console.log("🔁 Pinged self to stay awake"))
    .catch((err) => console.error("⚠️ Self ping failed:", err.message));
}, 13 * 60 * 1000); // every 13 minutes

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`🚀 Server + Frontend running at http://localhost:${PORT}`));

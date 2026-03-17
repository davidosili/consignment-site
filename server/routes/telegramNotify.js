require('dotenv').config();
const express = require('express');
const router = express.Router();
const { bot, sendMessageToUser } = require('../telegramBot');
const TelegramUser = require('../models/TelegramUser');

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

// --------------------
// Notify admin + optionally message the user
// --------------------
router.post('/telegram', async (req, res) => {
  try {
    console.log("📨 /telegram route called with body:", req.body);

    const { tempId, name, email, phone, address } = req.body;

    if (!tempId || !name) {
      console.log("❌ Missing tempId or name in request body");
      return res.status(400).json({ error: "Missing tempId or name" });
    }

    // -------------------- Admin message --------------------
    const msgToAdmin = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email || "N/A"}
📞 Phone: ${phone || "N/A"}
🏠 Address: ${address || "N/A"}
🆔 Temp ID: ${tempId}`;

    console.log(`➡️ Sending message to adminId=${adminId}...`);
    await bot.sendMessage(adminId, msgToAdmin);
    console.log("✅ Message sent to admin");

    // -------------------- Find user in DB --------------------
    console.log(`🔍 Looking for user with tempId=${tempId} in DB...`);

    // ✅ FIXED: lookup in tempIds array
    const user = await TelegramUser.findOne({ tempIds: tempId });
    console.log("🔹 User from DB:", user);

    if (user) {
      console.log("➡️ Sending message to user...");

      // Optional: include clickable link to complete receiver info
      await sendMessageToUser(
        tempId,
        `👋 Hi ${name}! We’ve received your delivery details.\n` +
        `Our team will reach out soon regarding your parcel (Temp ID: ${tempId}).\n` +
        `Complete your details here: ${process.env.BASE_URL || 'http://localhost:3000'}/receiver.html?id=${tempId}`
      );

      console.log("✅ Message sent to user");
    } else {
      console.log(`⚠️ User not linked yet for Temp ID: ${tempId}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Telegram Notify Error:", err.response?.body || err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

module.exports = router;

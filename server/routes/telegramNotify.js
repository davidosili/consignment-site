const express = require("express");
const router = express.Router();
const { sendMessageToUser, linkUserFromApi } = require("../telegramBot");
const TelegramUser = require("../models/TelegramUser");
const TelegramBot = require("node-telegram-bot-api");

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const BASE_URL = process.env.BASE_URL || "https://www.rapidroutesltd.com";

// Lightweight bot instance for sending messages
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

router.post("/telegram", async (req, res) => {
  try {
    console.log("📨 /telegram route called with body:", req.body);

    const { tempId, chatId, name, email, phone, address } = req.body;

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

    bot.sendMessage(adminId, msgToAdmin)
      .then(() => console.log("✅ Message sent to admin"))
      .catch(err => console.error("❌ Admin message failed:", err));

    // -------------------- Ensure user is linked --------------------
    console.log(`🔍 Looking for user with tempId=${tempId} in DB...`);
    let user = await TelegramUser.findOne({ tempIds: tempId });

    if (!user) {
      if (!chatId) {
        console.log(`⚠️ User not linked and no chatId provided for Temp ID: ${tempId}`);
      } else {
        console.log("➡️ Linking user automatically...");
        user = await linkUserFromApi(tempId, chatId, `User`);
        console.log("✅ User linked:", user);
      }
    }

    // -------------------- Send message to user --------------------
    if (user) {
      sendMessageToUser(
        tempId,
        `👋 Hi ${name}! We’ve received your delivery details.\n` +
        `Our team will reach out soon regarding your parcel (Temp ID: ${tempId}).\n` +
        `Complete your details here: ${BASE_URL}/receiver.html?id=${tempId}`
      ).then(() => console.log("✅ Triggered message to user"))
        .catch(err => console.error("❌ User message failed:", err));
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

module.exports = router;

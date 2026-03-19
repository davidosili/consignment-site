const express = require("express");
const router = express.Router();
const TelegramBot = require("node-telegram-bot-api");

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

// Lightweight bot instance for sending messages
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

router.post("/telegram", async (req, res) => {
  try {
    console.log("📨 /telegram route called to notify Admin...");

    const { tempId, name, email, phone, address } = req.body;

    if (!tempId || !name) {
      console.log("❌ Missing tempId or name in request body");
      return res.status(400).json({ error: "Missing tempId or name" });
    }

    // -------------------- Alert the Admin --------------------
    const msgToAdmin = `📦 New Receiver Submission

━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email || "N/A"}
📞 Phone: ${phone || "N/A"}
🏠 Address: ${address || "N/A"}
🆔 Temp ID: ${tempId}`;

    await bot.sendMessage(adminId, msgToAdmin);
    console.log("✅ Message successfully sent to admin");

    // Note: We no longer try to message the receiver here. 
    // They will get their welcome message automatically via telegramBot.js 
    // when they click the Telegram link and hit /start.

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

module.exports = router;

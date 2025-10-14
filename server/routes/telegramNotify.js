require('dotenv').config();
const express = require('express');
const router = express.Router();
const { bot } = require('../telegramBot');

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

// Receiver form - notify admin
router.post('/telegram', async (req, res) => {
  try {
    const { tempId, name, email, phone, address } = req.body;

    const messageToAdmin = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email}
📞 Phone: ${phone}
🏠 Address: ${address}
🆔 Temp ID: ${tempId}`;

    await bot.sendMessage(adminId, messageToAdmin);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

module.exports = router;

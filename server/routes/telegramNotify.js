require('dotenv').config();
const express = require('express');
const router = express.Router();
const { bot, userMap } = require('../telegramBot');

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

/**
 * CONTACT FORM — sends message to admin
 */
router.post('/contact', (req, res) => {
  const { name, email, message } = req.body;

  const text = `📬 New Contact Form Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email}
💬 Message: ${message}`;

  bot.sendMessage(adminId, text);
  res.send({ success: true });
});

/**
 * RECEIVER FORM — notify admin and (if possible) user
 */
router.post('/telegram', async (req, res) => {
  try {
    const { tempId, name, email, phone, address } = req.body;

    // Always notify admin
    const messageToAdmin = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email}
📞 Phone: ${phone}
🏠 Address: ${address}
🆔 Temp ID: ${tempId}`;

    await bot.sendMessage(adminId, messageToAdmin);

    // Optional: if this tempId is already linked to a Telegram user
    const userTelegramId = userMap.get(tempId);

    if (userTelegramId) {
      const replyMessage = `Hello ${name}, thank you for your submission! 💙
You are being redirected to our customer care service line to complete payment for your parcel (Temp ID: ${tempId}).`;

      await bot.sendMessage(userTelegramId, replyMessage);
    }

    // Always respond to the frontend
    res.status(200).json({
      success: true,
      userNotified: !!userTelegramId,
      message: userTelegramId
        ? "Message sent to linked Telegram user."
        : "Admin notified. User not yet linked on Telegram.",
    });

  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

module.exports = router;

// controllers/telegramController.js
const axios = require('axios');

exports.sendTelegram = async (req, res) => {
  const { tempId, name, email, phone, address } = req.body;
  try {
    // Replace BOT_TOKEN with your bot token
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID; // where you want to send the message

    const message = `📦 New Receiver Submitted:\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nTempID: ${tempId}`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message
    });

    res.status(200).json({ success: true, message: 'Telegram sent' });
  } catch (err) {
    console.error('Telegram error:', err);
    res.status(500).json({ error: 'Failed to send Telegram' });
  }
};

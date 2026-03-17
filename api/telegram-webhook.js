const { handleUpdate } = require('../telegramBot');

module.exports = async (req, res) => {
  try {
    await handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Error");
  }
};

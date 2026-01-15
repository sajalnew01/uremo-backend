const { getSocketHealthSnapshot } = require("../socket");

exports.getSocketHealth = async (req, res) => {
  try {
    const snapshot = getSocketHealthSnapshot();
    return res.json(snapshot);
  } catch (err) {
    console.error(`[DEBUG_SOCKET_HEALTH_FAIL] errMessage=${err?.message}`);
    return res.status(500).json({ message: "Unable to load socket health" });
  }
};

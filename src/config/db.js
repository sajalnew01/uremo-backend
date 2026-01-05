const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error("Missing MONGO_URI environment variable - aborting");
      process.exit(1);
    }
    const uri = process.env.MONGO_URI;
    // Mongoose v6+ enables the new URL parser and unified topology by default.
    // Passing the old options causes an error on some environments (e.g. Render):
    // "options usenewurlparser, useunifiedtopology are not supported".
    await mongoose.connect(uri);
    console.log(
      "MongoDB connected successfully to:",
      mongoose.connection.name || uri
    );
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;

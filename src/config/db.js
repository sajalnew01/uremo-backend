const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error("Missing MONGO_URI environment variable - aborting");
      process.exit(1);
    }
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
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

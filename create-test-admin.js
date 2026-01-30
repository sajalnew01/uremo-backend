/**
 * Create Test Admin User
 * Run: node create-test-admin.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: "user" },
  isVerified: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const adminEmail = "testadmin@uremo.com";
    const adminPassword = "Admin@123";

    // Check if admin exists
    let admin = await User.findOne({ email: adminEmail });

    if (admin) {
      console.log("Admin already exists, updating password...");
      admin.password = await bcrypt.hash(adminPassword, 10);
      admin.role = "admin";
      admin.isVerified = true;
      await admin.save();
    } else {
      console.log("Creating new admin user...");
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      admin = await User.create({
        firstName: "Test",
        lastName: "Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        isVerified: true,
      });
    }

    console.log("\n✅ Admin user ready!");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role: admin`);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();

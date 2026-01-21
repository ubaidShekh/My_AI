// server.js
require("dotenv").config(); //
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = "voiceai-secret-key-2024";

app.get("/", (req, res) => {
  res.json({ 
    message: "🎉 VoiceAI Backend API",
    status: "running",
    version: "1.0.0",
    endpoints: {
      public: ["/", "/api/health", "/api/test", "/api/auth/register", "/api/auth/login"],
      protected: "Requires Authorization header"
    }
  });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const mongodburl =
  "mongodb+srv://ubaidjmi202:12345678ubaidjmi202@cluster0.g9k3jpw.mongodb.net/?appName=Cluster0";
// Connect to MongoDB Atlas
mongoose
  .connect(mongodburl)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));
// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Conversation Schema
const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  messages: [
    {
      text: String,
      isUser: Boolean,
      time: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

// Voice Sample Schema
const voiceSampleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  quality: String,
  duration: Number,
  filePath: String,
  createdAt: { type: Date, default: Date.now },
});

// Settings Schema
const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  wakeWord: { type: String, default: "Hey Assistant" },
  sensitivity: { type: Number, default: 75 },
  voiceSpeed: { type: Number, default: 50 },
  backgroundService: { type: Boolean, default: true },
  voiceCloning: { type: Boolean, default: true },
  offlineMode: { type: Boolean, default: false },
  notifications: { type: Boolean, default: true },
  darkMode: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

// Create Models
const User = mongoose.model("User", userSchema);
const Conversation = mongoose.model("Conversation", conversationSchema);
const VoiceSample = mongoose.model("VoiceSample", voiceSampleSchema);
const Settings = mongoose.model("Settings", settingsSchema);

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// =============== AUTH ROUTES ===============

// User Registration
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
    });

    await user.save();

    // Create default settings for user
    const settings = new Settings({
      userId: user._id,
    });
    await settings.save();

    // Create token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// User Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Create token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// Test Route (No Authentication Required)
app.get("/api/test", (req, res) => {
  const dbStatus =
    mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";
  res.json({
    message: "Server is working!",
    timestamp: new Date().toISOString(),
    mongodb: dbStatus,
    database: "voiceaidb",
  });
});

// =============== CONVERSATION ROUTES ===============

// Get user conversations
app.get("/api/conversations", authenticateToken, async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(conversations);
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Create new conversation
app.post("/api/conversations", authenticateToken, async (req, res) => {
  try {
    const { messages } = req.body;

    const conversation = new Conversation({
      userId: req.user.userId,
      messages,
    });

    await conversation.save();
    res.status(201).json(conversation);
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Add message to conversation
app.post(
  "/api/conversations/:id/messages",
  authenticateToken,
  async (req, res) => {
    try {
      const { text, isUser, time } = req.body;

      const conversation = await Conversation.findOne({
        _id: req.params.id,
        userId: req.user.userId,
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      conversation.messages.push({ text, isUser, time });
      await conversation.save();

      res.json(conversation);
    } catch (error) {
      console.error("Add message error:", error);
      res.status(500).json({ error: "Failed to add message" });
    }
  },
);

// Clear conversation
app.delete("/api/conversations/:id", authenticateToken, async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ message: "Conversation deleted successfully" });
  } catch (error) {
    console.error("Delete conversation error:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// =============== VOICE SAMPLES ROUTES ===============

// Get user voice samples
app.get("/api/voice-samples", authenticateToken, async (req, res) => {
  try {
    const samples = await VoiceSample.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });

    res.json(samples);
  } catch (error) {
    console.error("Get voice samples error:", error);
    res.status(500).json({ error: "Failed to fetch voice samples" });
  }
});

// Add voice sample
app.post("/api/voice-samples", authenticateToken, async (req, res) => {
  try {
    const { quality, duration, filePath } = req.body;

    const sample = new VoiceSample({
      userId: req.user.userId,
      quality,
      duration,
      filePath,
    });

    await sample.save();
    res.status(201).json(sample);
  } catch (error) {
    console.error("Add voice sample error:", error);
    res.status(500).json({ error: "Failed to add voice sample" });
  }
});

// Delete voice sample
app.delete("/api/voice-samples/:id", authenticateToken, async (req, res) => {
  try {
    const sample = await VoiceSample.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!sample) {
      return res.status(404).json({ error: "Voice sample not found" });
    }

    res.json({ message: "Voice sample deleted successfully" });
  } catch (error) {
    console.error("Delete voice sample error:", error);
    res.status(500).json({ error: "Failed to delete voice sample" });
  }
});

// Clear all voice samples
app.delete("/api/voice-samples", authenticateToken, async (req, res) => {
  try {
    await VoiceSample.deleteMany({ userId: req.user.userId });
    res.json({ message: "All voice samples deleted successfully" });
  } catch (error) {
    console.error("Clear voice samples error:", error);
    res.status(500).json({ error: "Failed to clear voice samples" });
  }
});

// =============== SETTINGS ROUTES ===============

// Get user settings
app.get("/api/settings", authenticateToken, async (req, res) => {
  try {
    let settings = await Settings.findOne({ userId: req.user.userId });

    if (!settings) {
      // Create default settings if not found
      settings = new Settings({
        userId: req.user.userId,
      });
      await settings.save();
    }

    res.json(settings);
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// Update settings
app.put("/api/settings", authenticateToken, async (req, res) => {
  try {
    const updates = req.body;
    updates.updatedAt = Date.now();

    const settings = await Settings.findOneAndUpdate(
      { userId: req.user.userId },
      updates,
      { new: true, upsert: true },
    );

    res.json(settings);
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Change wake word
app.post("/api/settings/wake-word", authenticateToken, async (req, res) => {
  try {
    const { wakeWord } = req.body;

    const settings = await Settings.findOneAndUpdate(
      { userId: req.user.userId },
      { wakeWord, updatedAt: Date.now() },
      { new: true },
    );

    res.json(settings);
  } catch (error) {
    console.error("Change wake word error:", error);
    res.status(500).json({ error: "Failed to change wake word" });
  }
});

// =============== AI ASSISTANT ROUTES ===============

// AI Assistant response
app.post("/api/assistant/query", authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;

    // Simple AI responses based on keywords
    let response = "I'm your AI assistant. How can I help you?";

    if (message.toLowerCase().includes("weather")) {
      response = "It's sunny with a high of 75°F. Perfect for a walk!";
    } else if (message.toLowerCase().includes("time")) {
      const now = new Date();
      response = `The current time is ${now.toLocaleTimeString()}`;
    } else if (
      message.toLowerCase().includes("remind") ||
      message.toLowerCase().includes("schedule")
    ) {
      response =
        "You have a meeting at 2 PM and a dentist appointment at 4 PM.";
    } else if (message.toLowerCase().includes("music")) {
      response = "Playing your 'Relaxing Vibes' playlist on Spotify.";
    } else if (message.toLowerCase().includes("news")) {
      response = "Here are the top headlines for today...";
    } else if (
      message.toLowerCase().includes("hello") ||
      message.toLowerCase().includes("hi")
    ) {
      response = "Hello! How can I assist you today?";
    } else if (message.toLowerCase().includes("thank")) {
      response = "You're welcome! Is there anything else I can help with?";
    }

    res.json({ response });
  } catch (error) {
    console.error("AI query error:", error);
    res.status(500).json({ error: "Failed to process query" });
  }
});

// Train voice model
app.post("/api/assistant/train-voice", authenticateToken, async (req, res) => {
  try {
    const samples = await VoiceSample.countDocuments({
      userId: req.user.userId,
    });

    if (samples < 3) {
      return res.status(400).json({
        error: "More samples needed",
        message: "Please record at least 3 voice samples.",
      });
    }

    // Simulate training process
    setTimeout(() => {
      res.json({
        message: "Training complete",
        success: true,
        samplesUsed: samples,
      });
    }, 2000);
  } catch (error) {
    console.error("Train voice error:", error);
    res.status(500).json({ error: "Failed to train voice model" });
  }
});

// =============== PROFILE ROUTES ===============

// Get user profile
app.get("/api/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Update profile
app.put("/api/profile", authenticateToken, async (req, res) => {
  try {
    const { username, email } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { username, email },
      { new: true, select: "-password" },
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Change password
app.post(
  "/api/profile/change-password",
  authenticateToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      const validPassword = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!validPassword) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  },
);

// =============== UTILITY ROUTES ===============

// Health check
app.get("/api/health", (req, res) => {
  const dbStatus =
    mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";

  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "VoiceAI Backend API",
    database: dbStatus,
    version: "1.0.0",
  });
});

// Export data
app.get("/api/export", authenticateToken, async (req, res) => {
  try {
    const [conversations, voiceSamples, settings, user] = await Promise.all([
      Conversation.find({ userId: req.user.userId }),
      VoiceSample.find({ userId: req.user.userId }),
      Settings.findOne({ userId: req.user.userId }),
      User.findById(req.user.userId).select("-password"),
    ]);

    res.json({
      user,
      conversations,
      voiceSamples,
      settings,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

// Reset user data
app.post("/api/reset", authenticateToken, async (req, res) => {
  try {
    const { type } = req.body; // 'all', 'conversations', 'voiceSamples'

    if (type === "all" || type === "conversations") {
      await Conversation.deleteMany({ userId: req.user.userId });
    }

    if (type === "all" || type === "voiceSamples") {
      await VoiceSample.deleteMany({ userId: req.user.userId });
    }

    if (type === "all") {
      // Reset settings to defaults
      await Settings.findOneAndUpdate(
        { userId: req.user.userId },
        {
          wakeWord: "Hey Assistant",
          sensitivity: 75,
          voiceSpeed: 50,
          backgroundService: true,
          voiceCloning: true,
          offlineMode: false,
          notifications: true,
          darkMode: false,
          updatedAt: Date.now(),
        },
      );
    }

    res.json({ message: `${type} data reset successfully` });
  } catch (error) {
    console.error("Reset error:", error);
    res.status(500).json({ error: "Failed to reset data" });
  }
});

// =============== START SERVER ===============

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Test Route: http://localhost:${PORT}/api/test`);
  console.log(`💾 Database: voiceaidb`);
  console.log(
    `📊 MongoDB Status: ${mongoose.connection.readyState === 1 ? "Connected" : "Connecting..."}`,
  );
});

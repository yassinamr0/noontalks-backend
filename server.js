const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(cors({
  origin: 'https://www.noon-talks.online',
  methods: ['GET', 'POST'],
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(express.json());

// Constants
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'noon2024';
const PORT = process.env.PORT || 5000;

// MongoDB connection
const MONGODB_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_HOST}/${process.env.MONGO_DB}`;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  code: { type: String, required: true, unique: true },
  entries: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Middleware
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};

// Helper function
const generateCode = async (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (await User.findOne({ code }));
  return code;
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Admin routes
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_TOKEN) {
    res.json({ token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ message: 'Invalid password' });
  }
});

app.post('/admin/generate-codes', adminAuth, async (req, res) => {
  try {
    const { count } = req.body;
    const numCodes = Math.min(parseInt(count) || 1, 100);
    const codes = [];
    
    for (let i = 0; i < numCodes; i++) {
      const code = await generateCode();
      await User.create({ code });
      codes.push(code);
    }
    
    res.json({
      message: 'Codes generated successfully',
      codes
    });
  } catch (error) {
    console.error('Generate codes error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.get('/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort('-createdAt');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// User routes
app.post('/register', async (req, res) => {
  try {
    const { name, email, code } = req.body;
    const user = await User.findOne({ code });
    if (!user) {
      return res.status(404).json({ message: 'Invalid code' });
    }
    if (user.name || user.email) {
      return res.status(400).json({ message: 'Code already used' });
    }
    user.name = name;
    user.email = email;
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findOne({ code });
    if (!user || !user.name) {
      return res.status(404).json({ message: 'Invalid code or user not registered' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/admin/scan', adminAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findOne({ code });
    if (!user || !user.name) {
      return res.status(404).json({ message: 'Invalid code or user not registered' });
    }
    user.entries += 1;
    await user.save();
    res.json({ message: 'Ticket scanned successfully', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

// Start server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;

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
  email: { type: String, required: true, unique: true },
  phone: String,
  entries: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastEntry: Date
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

app.post('/admin/add-user', adminAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const user = await User.create({ name, email, phone });
    
    res.json({
      message: 'User added successfully',
      user
    });
  } catch (error) {
    console.error('Add user error:', error);
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

app.post('/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/admin/scan', adminAuth, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ 
        isValid: false,
        message: 'Invalid ticket' 
      });
    }

    user.entries += 1;
    user.lastEntry = new Date();
    await user.save();

    res.json({
      isValid: true,
      user,
      message: 'Ticket scanned successfully'
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      isValid: false,
      message: error.message 
    });
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

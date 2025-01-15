const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Constants
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'noon2024';
const PORT = process.env.PORT || 5000;

// MongoDB URI construction
const MONGODB_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_HOST}/${process.env.MONGO_DB}`;

// MongoDB connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  code: { type: String, required: true, unique: true },
  entries: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Admin middleware
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or missing token'
    });
  }
  
  next();
};

// Generate code
async function generateCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = Array.from(
      { length }, 
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (await User.findOne({ code }));
  
  return code;
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Admin routes
app.post('/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Password is required'
      });
    }

    if (password !== ADMIN_TOKEN) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid password'
      });
    }

    res.json({
      message: 'Login successful',
      token: ADMIN_TOKEN
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.post('/admin/generate-codes', adminAuth, async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count) || 1, 100);
    const codes = [];
    
    for (let i = 0; i < count; i++) {
      const code = await generateCode();
      await User.create({ code });
      codes.push(code);
    }
    
    res.json({
      message: `Generated ${codes.length} codes`,
      codes
    });
  } catch (error) {
    console.error('Generate codes error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.get('/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort('-createdAt');
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// User routes
app.post('/register', async (req, res) => {
  try {
    const { name, email, code } = req.body;

    if (!name || !email || !code) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Name, email, and code are required'
      });
    }

    const user = await User.findOne({ code });
    
    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid code'
      });
    }

    if (user.name || user.email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Code already used'
      });
    }

    user.name = name;
    user.email = email;
    await user.save();

    res.json({
      message: 'Registration successful',
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Code is required'
      });
    }

    const user = await User.findOne({ code });
    
    if (!user || !user.name) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid code or user not registered'
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

app.post('/admin/scan', adminAuth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Code is required'
      });
    }

    const user = await User.findOne({ code });
    
    if (!user || !user.name) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid code or user not registered',
        isValid: false
      });
    }

    user.entries += 1;
    await user.save();

    res.json({
      message: 'Ticket scanned successfully',
      isValid: true,
      user
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      isValid: false
    });
  }
});

// Error middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;

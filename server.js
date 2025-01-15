const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration
const allowedOrigins = ['https://www.noon-talks.online', 'http://localhost:5173'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// Admin token
const ADMIN_TOKEN = 'noontalks2024';

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ message: 'Invalid admin token' });
  }

  next();
};

// MongoDB connection
const mongoUrl = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_HOST}/${process.env.MONGO_DB}`;
mongoose.connect(mongoUrl)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  code: { type: String, unique: true },
  registeredAt: { type: Date, default: Date.now },
  entries: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

// Valid Codes Schema
const validCodeSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const ValidCode = mongoose.model('ValidCode', validCodeSchema);

// Function to generate a random code
function generateCode(length = 6) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// Function to generate unique codes
async function generateUniqueCodes(count) {
  const codes = new Set();
  const existingCodes = new Set((await ValidCode.find({}, 'code')).map(doc => doc.code));
  
  while (codes.size < count) {
    const code = generateCode();
    if (!existingCodes.has(code) && !codes.has(code)) {
      codes.add(code);
    }
  }
  
  return Array.from(codes);
}

// Routes
app.get('/api/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ registeredAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, phone, code } = req.body;
    const upperCode = code.toUpperCase();

    // Check if code exists
    const validCode = await ValidCode.findOne({ code: upperCode });
    if (!validCode) {
      return res.status(400).json({ message: 'Invalid registration code' });
    }

    // Check if code is already used
    const existingUser = await User.findOne({ code: upperCode });
    if (existingUser) {
      return res.status(400).json({ message: 'Code already used' });
    }

    // Create new user
    const newUser = new User({
      name,
      email,
      phone,
      code: upperCode,
      entries: 0
    });

    // Save user
    await newUser.save();

    // Remove used code
    await ValidCode.deleteOne({ code: upperCode });

    res.json(newUser);
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findOne({ code: code.toUpperCase() });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid code' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/users/scan', async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findOne({ code: code.toUpperCase() });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid code' });
    }

    user.entries += 1;
    await user.save();

    res.json(user);
  } catch (error) {
    console.error('Error scanning ticket:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/codes/generate', adminAuth, async (req, res) => {
  try {
    const { count = 1 } = req.body;
    
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return res.status(400).json({ message: 'Please enter a valid count between 1 and 100' });
    }

    const generatedCodes = await generateUniqueCodes(count);
    const validCodes = generatedCodes.map(code => ({ code }));
    
    await ValidCode.insertMany(validCodes);
    res.json({ codes: generatedCodes, message: 'Codes generated successfully' });
  } catch (error) {
    console.error('Error generating codes:', error);
    res.status(500).json({ message: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

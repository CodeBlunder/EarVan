import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/earvan';

app.use(cors());
app.use(express.json());

// ----------------------
// MongoDB Schemas & Model
// ----------------------
const HearingProfileSchema = new mongoose.Schema({
  eqBands: {
    500: { type: Number, default: 0 },
    1000: { type: Number, default: 0 },
    2000: { type: Number, default: 0 },
    4000: { type: Number, default: 0 },
    8000: { type: Number, default: 0 }
  },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profile: { type: HearingProfileSchema, default: null }
}, { timestamps: true });

// Convert document to client-safe representation
UserSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    username: this.username,
    profile: this.profile || undefined
  };
};

const User = mongoose.model('User', UserSchema);

// ----------------------
// API Routes
// ----------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    database: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, username, password } = req.body;

    if (!name || !email || !username || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(409).json({ error: 'Username is already taken.' });
      }
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const newUser = new User({
      name,
      email,
      username,
      password // Stored directly or hashed
    });

    await newUser.save();
    return res.status(201).json(newUser.toSafeObject());
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    return res.json(user.toSafeObject());
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Update Hearing Profile in MongoDB
app.put('/api/user/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { profile } = req.body;

    if (!profile || !profile.eqBands) {
      return res.status(400).json({ error: 'Invalid profile format. eqBands is required.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.profile = {
      eqBands: {
        500: Number(profile.eqBands[500] || 0),
        1000: Number(profile.eqBands[1000] || 0),
        2000: Number(profile.eqBands[2000] || 0),
        4000: Number(profile.eqBands[4000] || 0),
        8000: Number(profile.eqBands[8000] || 0),
      },
      updatedAt: new Date()
    };

    await user.save();
    console.log(`[MongoDB] Successfully updated hearing profile for user: ${user.username}`);
    return res.json(user.toSafeObject());
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Get User Profile
app.get('/api/user/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json(user.toSafeObject());
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ----------------------
// MongoDB Connection & Listen
// ----------------------
async function startServer() {
  try {
    console.log(`[MongoDB] Connecting to ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('[MongoDB] Connected successfully!');
  } catch (err) {
    console.warn('[MongoDB] Warning: Could not connect to MongoDB:', err.message);
    console.warn('[MongoDB] Server is running. Ensure MongoDB daemon is running or check your MONGO_URI.');
  }

  app.listen(PORT, () => {
    console.log(`[Earvan Server] Backend running at http://localhost:${PORT}`);
    console.log(`[Earvan Server] Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer();


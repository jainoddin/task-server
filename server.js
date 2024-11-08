const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan'); // For logging
const dotenv = require('dotenv'); // For managing environment variables

dotenv.config(); // Load environment variables

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev')); // Logging middleware

// Configure file uploads and ensure "uploads" directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage: storage, limits: { fileSize: 100 * 1024 * 1024 } });

// MongoDB connection with pooling options
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10, // Use maxPoolSize instead of poolSize if setting connection pool size
});

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, index: true }, // Index on email for faster searches
  password: String,
  role: { type: String, default: 'user' },
});
const User = mongoose.model('User', userSchema);

// Event Schema
const eventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },
  location: String,
  eventName: String,
  date: Date,
  photos: [String],
  videos: [String],
});
const Event = mongoose.model('Event', eventSchema);

// Middleware for token verification
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).send('No token provided');
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send('Failed to authenticate token');
    req.userId = decoded.id;
    next();
  });
};

// Routes for Users
app.route('/api/users')
  .get(async (req, res) => {
    try {
      const users = await User.find().select('name email role'); // Select specific fields to optimize
      res.status(200).json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  })
  .post(async (req, res) => {
    try {
      const user = new User(req.body);
      await user.save();
      res.status(201).json({ message: 'User created', user });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })
  .put(async (req, res) => {
    try {
      const { id, name, email, password, role } = req.body;
      const updatedUser = await User.findByIdAndUpdate(id, { name, email, password, role }, { new: true });
      res.status(200).json({ message: 'User updated', user: updatedUser });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

app.route('/api/users/:id')
  .get(async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// Routes for Events
app.route('/api/events')
  .get(async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query; // Pagination parameters
      const events = await Event.find()
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();
      res.status(200).json({ events });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  })
  .post(upload.fields([{ name: 'photos' }, { name: 'videos' }]), async (req, res) => {
    try {
      const { location, eventName, date, userId } = req.body;
      const photoPaths = req.files['photos'] ? req.files['photos'].map(file => file.path.replace(/\\/g, '/')) : [];
      const videoPaths = req.files['videos'] ? req.files['videos'].map(file => file.path.replace(/\\/g, '/')) : [];

      const event = new Event({ location, eventName, date, userId, photos: photoPaths, videos: videoPaths });
      await event.save();
      res.status(201).json({ message: 'Event created successfully', event });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

app.route('/api/events/:eventId')
  .put(upload.fields([{ name: 'photos', maxCount: 10 }, { name: 'videos', maxCount: 10 }]), async (req, res) => {
    try {
      const { location, eventName, date } = req.body;
      const event = await Event.findById(req.params.eventId);
      if (!event) return res.status(404).json({ message: 'Event not found' });

      if (event.photos) {
        event.photos.forEach(photo => fs.unlink(photo, err => err && console.error(err)));
      }
      if (event.videos) {
        event.videos.forEach(video => fs.unlink(video, err => err && console.error(err)));
      }

      const photoPaths = req.files['photos'] ? req.files['photos'].map(file => file.path.replace(/\\/g, '/')) : [];
      const videoPaths = req.files['videos'] ? req.files['videos'].map(file => file.path.replace(/\\/g, '/')) : [];

      event.location = location || event.location;
      event.eventName = eventName || event.eventName;
      event.date = date || event.date;
      event.photos = photoPaths;
      event.videos = videoPaths;

      await event.save();
      res.status(200).json({ message: 'Event updated successfully', event });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  })
  .get(async (req, res) => {
    try {
      const event = await Event.findById(req.params.eventId);
      if (!event) return res.status(404).json({ message: 'Event not found' });
      res.status(200).json(event);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// User Login Route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ message: 'Login successful', token, role: user.role });
});

// Get Events by User ID
app.get('/api/events/user/:userId', async (req, res) => {
  try {
    const events = await Event.find({ userId: req.params.userId });
    if (!events.length) return res.status(404).json({ message: 'No events found for this user' });
    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(5001, () => {
  console.log('Server running on http://localhost:5001');
}); 
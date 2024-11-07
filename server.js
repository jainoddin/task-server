const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure file uploads and ensure "uploads" directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use(express.static(uploadsDir)); // Serve static files

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage: storage, limits: { fileSize: 100 * 1024 * 1024 } });


// MongoDB connection
mongoose.connect(`mongodb+srv://skjainoddin39854:hngmFxWB8ZLTHpwW@cluster0.lbfgvl4.mongodb.net/SampleExpress?retryWrites=true&w=majority
//  JWT_SECRET=tUao3/fmx20gO0uLwpnlJ6t2qzMeOEWAxsIz/OG+3y4=`, { useNewUrlParser: true, useUnifiedTopology: true });

// User Schema



const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: { type: String, default: 'user' },
});

const User = mongoose.model('User', userSchema);

// Event Schema
const eventSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  location: String,
  eventName: String,
  date: Date,
  photos: [String],
  videos: [String],
});

const Event = mongoose.model('Event', eventSchema);

// Routes handling Users and Events under a single '/api' endpoint

app.route('/api/users')
  .get(async (req, res) => {
    try {
      const users = await User.find();
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
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// Routes for Events

app.route('/api/events')
  .get(async (req, res) => {
    try {
      const events = await Event.find();
      if (!events || events.length === 0) {
        return res.status(404).json({ message: 'No events found' });
      }
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
      const photoPaths = req.files['photos'] ? req.files['photos'].map(file => file.path.replace(/\\/g, '/')) : [];
      const videoPaths = req.files['videos'] ? req.files['videos'].map(file => file.path.replace(/\\/g, '/')) : [];

      const updatedEvent = await Event.findByIdAndUpdate(
        req.params.eventId,
        { location, eventName, date, $push: { photos: { $each: photoPaths }, videos: { $each: videoPaths } } },
        { new: true }
      );

      if (!updatedEvent) {
        return res.status(404).json({ message: 'Event not found' });
      }
      res.status(200).json({ message: 'Event updated successfully', event: updatedEvent });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  })
  .get(async (req, res) => {
    try {
      const event = await Event.findById(req.params.eventId);
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
      res.status(200).json(event);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// User Login Route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  // Verify if user exists and password is correct
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Sign JWT token with user ID and role
  const token = jwt.sign({ id: user._id, role: user.role }, 'secretkey', { expiresIn: '1h' });

  // Return token and role
  res.json({ message: 'Login successful', token, role: user.role });
});

// Get Events by User ID
app.get('/api/events/user/:userId', async (req, res) => {
  try {
    const events = await Event.find({ userId: req.params.userId });
    if (!events || events.length === 0) {
      return res.status(404).json({ message: 'No events found for this user' });
    }
    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});

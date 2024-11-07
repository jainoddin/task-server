const jwt = require('jsonwebtoken');

const jwtAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', ''); // Extract token from Authorization header

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, 'secretkey'); // Replace 'secretkey' with your actual secret
    req.user = decoded; // Attach user information to request object
    next();
  } catch (error) {
    return res.status(400).json({ message: 'Invalid token' });
  }
};

module.exports = jwtAuth;

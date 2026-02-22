require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const twilio = require('twilio');

const app = express();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 5 * 60 * 1000 } // 5 minutes
}));

// Helper: generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ROUTE 1: Send OTP
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) return res.json({ success: false, message: 'Phone number required' });

  const otp = generateOTP();
  req.session.otp = otp;
  req.session.phone = phone;
  req.session.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 min expiry

  try {
    await client.messages.create({
      body: `Your OTP is: ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    console.log(`OTP sent: ${otp}`); // Remove in production
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Failed to send OTP: ' + err.message });
  }
});

// ROUTE 2: Verify OTP
app.post('/verify-otp', (req, res) => {
  const { otp } = req.body;

  if (!req.session.otp) {
    return res.json({ success: false, message: 'No OTP found. Please request again.' });
  }

  if (Date.now() > req.session.otpExpiry) {
    return res.json({ success: false, message: 'OTP expired. Please request again.' });
  }

  if (otp === req.session.otp) {
    req.session.loggedIn = true;
    req.session.otp = null; // Clear OTP after use
    return res.json({ success: true, message: 'Login successful!' });
  }

  res.json({ success: false, message: 'Invalid OTP. Try again.' });
});

// ROUTE 3: Check auth status
app.get('/dashboard', (req, res) => {
  if (req.session.loggedIn) {
    res.json({ success: true, phone: req.session.phone });
  } else {
    res.status(401).json({ success: false, message: 'Not logged in' });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
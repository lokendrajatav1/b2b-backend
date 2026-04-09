require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const AppError = require("./utils/AppError");
const globalErrorHandler = require("./middleware/error.middleware");

const authRoutes = require("./routes/auth.routes");
const vendorRoutes = require("./routes/vendor.routes");
const leadRoutes = require("./routes/lead.routes");
const adminRoutes = require("./routes/admin.routes");
const paymentRoutes = require("./routes/payment.routes");
const notificationRoutes = require("./routes/notification.routes");
const packageController = require("./controllers/package.controller");

// Initialize Jobs (Skip in test mode to prevent open handles)
if (process.env.NODE_ENV !== 'test') {
  require("./jobs/ranking.job");
  require("./jobs/followup.job");
  require("./jobs/expiry.job");
}

const app = express();

// 1. SECURITY MIDDLEWARE
app.use(helmet()); // Security Headers (XSS, Clickjacking, etc.)
app.use(hpp());    // Prevent HTTP Parameter Pollution

// Rate Limiting: Max 100 requests per 15 minutes from an IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use("/api", limiter);

// 2. PERFORMANCE MIDDLEWARE
app.use(compression()); // Gzip compression for faster load times

// 3. CORS & DATA PARSING
app.use(cors({
  origin: true, // Mirror the request origin to allow all sources in DEV
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Passport Config
require("./config/passport");
const passport = require("passport");
app.use(passport.initialize());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/refunds", require("./routes/refund.routes"));
app.use("/api/subadmins", require("./routes/subadmin.routes"));

// Public: Package listing
app.get("/api/packages", packageController.getAllPackages);

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("B2B Marketplace API Running");
});

// Handle undefined routes
app.all('*path', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
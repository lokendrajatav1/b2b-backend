require("dotenv").config();
console.log("[CRITICAL] SERVER.JS IS STARTING - TIMESTAMP: " + Date.now());

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

// 1. GLOBAL ACCESS
app.use(cors({
  origin: true,
  credentials: true
}));

const { upload, handleCloudinaryUpload } = require('./config/cloudinary');
const auth = require('./middleware/auth.middleware');
const authController = require('./controllers/auth.controller');

// ✅ CORRECT ROUTE
app.post(
  '/api/avatar-upload',
  auth,
  upload.single('image'),
  handleCloudinaryUpload,
  authController.uploadAvatar
);

// 2. SECURITY MIDDLEWARE
app.use(helmet()); // Security Headers (XSS, Clickjacking, etc.)
app.use(hpp());    // Prevent HTTP Parameter Pollution

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use("/api", limiter);

// 3. PERFORMANCE & DATA PARSING
app.use(compression());
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
app.use("/api/subadmins", require("./routes/staff.routes"));
app.use("/api/settings", require("./routes/settings.routes"));

// Public: Package and Category listing
app.get("/api/packages", packageController.getAllPackages);
app.get("/api/categories", require('./controllers/category.controller').getAllCategories);

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("B2B Marketplace API Running");
});

// Handle undefined routes
app.use((req, res, next) => {
  next(new AppError(`[SYNC-DEBUG-404] Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[B2B-API-LOG] Server is running on port ${PORT} - VER-SYNC-1`);
  });
}

module.exports = app;
require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const passport = require("passport");

const AppError = require("./shared/errors/app-error");
const globalErrorHandler = require("./api/v1/middlewares/error.middleware");
const v1Routes = require("./api/v1/routes");
const { serverAdapter, bullBoardAuth } = require("./config/bullboard");

// Passport Config
require("./config/passport");

const app = express();

// 1. GLOBAL ACCESS
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// 2. SECURITY MIDDLEWARE
// Relax CSP only for Bull Board dashboard (needs inline scripts/styles)
app.use("/admin/queues", helmet({
  contentSecurityPolicy: false,
}));
app.use(helmet());
app.use(hpp()); 

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use("/api", limiter);

// 3. PERFORMANCE & DATA PARSING
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use(passport.initialize());

// 4. BULL BOARD QUEUE DASHBOARD
// Access: http://localhost:5000/admin/queues
// Credentials: BULL_BOARD_USER / BULL_BOARD_PASSWORD from .env
app.use("/admin/queues", bullBoardAuth, serverAdapter.getRouter());

// 5. API V1 ROUTES
app.use("/api/v1", v1Routes);
app.use("/api", v1Routes); // Support legacy /api prefix

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("B2B Marketplace API Running - Structured v1");
});

// Handle undefined routes
app.use((req, res, next) => {
  next(
    new AppError(
      `Can't find ${req.originalUrl} on this server!`,
      404,
    ),
  );
});

// Global Error Handler
app.use(globalErrorHandler);

module.exports = app;

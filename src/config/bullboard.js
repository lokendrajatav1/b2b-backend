const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");

const {
  leadQueue,
  rankingQueue,
  notificationQueue,
  subscriptionQueue,
} = require("../queues");

// Create Express adapter for serving the dashboard UI
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

// Register all queues with Bull Board
createBullBoard({
  queues: [
    new BullMQAdapter(leadQueue),
    new BullMQAdapter(rankingQueue),
    new BullMQAdapter(notificationQueue),
    new BullMQAdapter(subscriptionQueue),
  ],
  serverAdapter,
});

/**
 * Simple middleware to protect the Bull Board dashboard.
 * Reads credentials from .env:  BULL_BOARD_USER / BULL_BOARD_PASSWORD
 * Falls back to 'admin' / 'admin123' if not set.
 */
const bullBoardAuth = (req, res, next) => {
  // Skip auth in test mode
  if (process.env.NODE_ENV === "test") return next();

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Bull Board"');
    return res.status(401).send("Authentication required.");
  }

  const base64 = authHeader.split(" ")[1];
  const [user, password] = Buffer.from(base64, "base64").toString().split(":");

  const expectedUser = process.env.BULL_BOARD_USER || "admin";
  const expectedPass = process.env.BULL_BOARD_PASSWORD || "admin123";

  if (user === expectedUser && password === expectedPass) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Bull Board"');
  return res.status(401).send("Invalid credentials.");
};

module.exports = { serverAdapter, bullBoardAuth };

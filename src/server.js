const app = require("./app");
const { scheduleRepeatableJobs } = require("./queues");

// Initialize Queues & Workers (Skip in test mode)
if (process.env.NODE_ENV !== "test") {
  require("./workers/worker-registry"); // Starts workers
  scheduleRepeatableJobs()
    .then(() => {
      console.log(
        "[QUEUES] Repeatable jobs scheduled (Ranking, Aged Leads & Subscriptions)",
      );
    })
    .catch((err) => {
      console.error("[QUEUES-ERROR] Failed to schedule repeatable jobs:", err);
    });
}

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`[B2B-API] Server running on port ${PORT}`);
});

// Handle unhandled rejections
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

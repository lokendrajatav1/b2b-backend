const jwt = require("jsonwebtoken");
const catchAsync = require("../../../shared/helpers/catch-async");
const AppError = require("../../../shared/errors/app-error");

module.exports = catchAsync(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    console.log('❌ Auth Middleware: No token found in headers');
    return next(new AppError("You are not logged in! Please log in to get access.", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`✅ Auth Middleware: Token verified for user ${decoded.id} with role ${decoded.role}`);
    req.user = decoded;
    next();
  } catch (err) {
    console.log(`❌ Auth Middleware: Token verification failed - ${err.message}`);
    if (err.name === 'TokenExpiredError') {
      return next(new AppError("TOKEN_EXPIRED", 401));
    }
    return next(new AppError("Invalid token. Please log in again!", 401));
  }
});
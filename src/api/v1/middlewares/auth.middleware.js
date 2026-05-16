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
    return next(new AppError("You are not logged in! Please log in to get access.", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError("TOKEN_EXPIRED", 401));
    }
    return next(new AppError("Invalid token. Please log in again!", 401));
  }
});
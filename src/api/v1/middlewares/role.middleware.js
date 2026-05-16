const AppError = require("../../../shared/errors/app-error");

module.exports = (...roles) => {
  return (req, res, next) => {
    // roles ['SUPERADMIN', 'VENDOR']. req.user.role 'BUYER'
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this action", 403)
      );
    }

    next();
  };
};

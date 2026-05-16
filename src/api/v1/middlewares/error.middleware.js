const AppError = require('../../../shared/errors/app-error');

const handlePrismaError = (err) => {
  if (err.code === 'P2002') {
    const field = err.meta?.target?.join(', ') || 'field';
    return new AppError(`Duplicate value for ${field}. This record already exists.`, 400);
  }
  if (err.code === 'P2025') {
    return new AppError('Record not found.', 404);
  }
  if (err.code === 'P2003') {
    return new AppError('Related record not found. Please check your references.', 400);
  }
  return null;
};

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    console.error('ERROR 💥', err);
    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  const prismaError = handlePrismaError(err);
  if (prismaError) {
    err = prismaError;
  }

  if (err.name === 'JsonWebTokenError') {
    err = new AppError('Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    err = new AppError('Your token has expired. Please log in again.', 401);
  }

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

const Joi = require('joi');
const AppError = require('../utils/AppError');

const validate = (schema) => (req, res, next) => {
  const validSchema = ['params', 'query', 'body'].reduce((acc, key) => {
    if (schema[key]) acc[key] = schema[key];
    return acc;
  }, {});

  const object = Object.keys(validSchema).reduce((acc, key) => {
    acc[key] = req[key];
    return acc;
  }, {});

  const { value, error } = Joi.object(validSchema)
    .prefs({ errors: { label: 'key' }, abortEarly: false })
    .validate(object);

  if (error) {
    const errorMessage = error.details.map((details) => details.message).join(', ');
    return next(new AppError(errorMessage, 400));
  }
  
  Object.keys(value).forEach((key) => {
    // In newer Express versions, req.query is a getter. We must override it by redefining.
    Object.defineProperty(req, key, {
      value: value[key],
      writable: true,
      enumerable: true,
      configurable: true
    });
  });
  return next();
};

module.exports = validate;

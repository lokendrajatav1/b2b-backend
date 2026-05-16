const Joi = require("joi");
const AppError = require("../../../shared/errors/app-error");

const validate = (schema) => (req, res, next) => {
  const validSchema = ["params", "query", "body"].reduce((acc, key) => {
    if (schema[key]) acc[key] = schema[key];
    return acc;
  }, {});

  const object = Object.keys(validSchema).reduce((acc, key) => {
    acc[key] = req[key];
    return acc;
  }, {});

  const { value, error } = Joi.object(validSchema)
    .prefs({ errors: { label: "key" }, abortEarly: false })
    .validate(object);

  if (error) {
    const errorMessage = error.details
      .map((details) => details.message)
      .join(", ");
    return next(new AppError(errorMessage, 400));
  }

  Object.assign(req, value);
  return next();
};

module.exports = validate;

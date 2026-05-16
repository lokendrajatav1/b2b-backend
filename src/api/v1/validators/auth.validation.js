const Joi = require("joi");

const authValidation = {
  register: {
    body: Joi.object().keys({
      email: Joi.string().required().email(),
      password: Joi.string().required().min(6),
      name: Joi.string().required().trim(),
      phone: Joi.string().optional().allow(""),
      otp: Joi.string().optional().allow(""),
      role: Joi.string().optional().valid("BUYER", "VENDOR"),
      confirmPassword: Joi.any().optional(),
    }),
  },
  login: {
    body: Joi.object()
      .keys({
        email: Joi.string().email().optional(),
        phone: Joi.string().optional(),
        password: Joi.string().required(),
      })
      .or("email", "phone"),
  },
  requestOTP: {
    body: Joi.object().keys({
      phone: Joi.string().required().min(10).max(15),
    }),
  },
  requestEmailOTP: {
    body: Joi.object().keys({
      email: Joi.string().required().email(),
    }),
  },
  forgotPassword: {
    body: Joi.object().keys({
      email: Joi.string().required().email(),
    }),
  },
  resetPassword: {
    params: Joi.object().keys({
      token: Joi.string().required(),
    }),
    body: Joi.object().keys({
      password: Joi.string().required().min(6),
    }),
  },
};

module.exports = authValidation;

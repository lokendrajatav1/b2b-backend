const Joi = require('joi');

const vendorValidation = {
  searchVendors: {
    query: Joi.object().keys({
      city: Joi.string().required(),
      categoryId: Joi.string().allow(''),
      search: Joi.string().allow(''), // For Keyword search
      limit: Joi.number().integer().min(1).max(100).default(20),
      page: Joi.number().integer().min(1).default(1),
    }),
  },
  registerVendor: {
    body: Joi.object().keys({
      businessName: Joi.string().required(),
      email: Joi.string().email().required(),
      phone: Joi.string().required(),
      gstNumber: Joi.string().allow(''),
      aadhaarNumber: Joi.string().allow(''),
      city: Joi.string().required(),
      categoryIds: Joi.array().items(Joi.string()).required(),
      acceptTerms: Joi.boolean().valid(true).required(),
      description: Joi.string().allow(''),
      address: Joi.string().allow(''),
      socialLinks: Joi.object().allow(null),
      googleBusinessLink: Joi.string().allow(''),
      workingHours: Joi.string().allow(''),
      verificationDocument: Joi.string().allow(''),
      logoUrl: Joi.string().allow('')
    }),
  },
  updateProfile: {
    body: Joi.object().keys({
      businessName: Joi.string(),
      description: Joi.string().allow(''),
      address: Joi.string().allow(''),
      socialLinks: Joi.object().keys({
        linkedin: Joi.string().uri().allow(''),
        twitter: Joi.string().uri().allow(''),
        facebook: Joi.string().uri().allow(''),
        instagram: Joi.string().uri().allow(''),
      }).allow(null),
      googleBusinessLink: Joi.string().uri().allow(''),
      workingHours: Joi.string().allow(''),
      products: Joi.array().items(Joi.any()),
      keywords: Joi.array().items(Joi.string()),
      categoryIds: Joi.array().items(Joi.string()),
      gstNumber: Joi.string().allow(''),
      aadhaarNumber: Joi.string().allow(''),
      verificationDocument: Joi.string().allow(''),
      logoUrl: Joi.string().allow('')
    }),
  },
};

module.exports = {
  vendorValidation,
};

const Joi = require('joi');

const authValidation = {
  register: {
    body: Joi.object().keys({
      email: Joi.string().required().email(),
      password: Joi.string().required().min(6),
      name: Joi.string().required().trim(),
      phone: Joi.string().optional().allow(''),
      otp: Joi.string().optional().allow(''),
      role: Joi.string().optional().valid('BUYER', 'VENDOR'),
      confirmPassword: Joi.any().optional(), // Frontend may send this
    }),
  },
  login: {
    body: Joi.object().keys({
      email: Joi.string().email().optional(),
      phone: Joi.string().optional(),
      password: Joi.string().required(),
    }).or('email', 'phone'),
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
};

const leadValidation = {
  createLead: {
    body: Joi.object().keys({
      buyerName: Joi.string().required().trim(),
      phone: Joi.string().required().min(10).max(15),
      city: Joi.string().required().trim(),
      categoryId: Joi.string().required().uuid(),
      searchKeyword: Joi.string().optional().allow(''),
      message: Joi.string().optional().allow(''),
      type: Joi.string().optional().valid('IDLE', 'INQUIRY'),
    }),
  },
  createDirectLead: {
    body: Joi.object().keys({
      vendorId: Joi.string().required().uuid(),
      actionType: Joi.string().required().valid('CALL', 'WHATSAPP', 'CHAT'),
      buyerName: Joi.string().optional().allow(''),
      phone: Joi.string().optional().allow(''),
      city: Joi.string().optional().allow(''),
      categoryId: Joi.string().optional(),
    }),
  },
  updateLeadStatus: {
    body: Joi.object().keys({
      status: Joi.string().required().valid('CLOSED', 'REDISTRIBUTE'),
    }),
  },
};

const vendorValidation = {
  registerVendor: {
    body: Joi.object().keys({
      businessName: Joi.string().required().trim(),
      email: Joi.string().required().email(),
      phone: Joi.string().required().min(10).max(15),
      gstNumber: Joi.string().required(),
      aadhaarNumber: Joi.string().required().length(12),
      city: Joi.string().required().trim(),
      categoryIds: Joi.array().items(Joi.string().uuid()).required(),
      description: Joi.string().optional().allow(''),
      address: Joi.string().optional().allow(''),
      socialLinks: Joi.object().optional(),
      googleBusinessLink: Joi.string().optional().allow(''),
      workingHours: Joi.string().optional().allow(''),
      verificationDocument: Joi.string().optional().allow(null, ''),
      logoUrl: Joi.string().optional().allow(null, ''),
    }),
  },
  searchVendors: {
    query: Joi.object().keys({
      city: Joi.string().optional().trim(),
      categoryId: Joi.string().optional().uuid(),
      search: Joi.string().optional().allow(''),
      page: Joi.number().optional().min(1).default(1),
      limit: Joi.number().optional().min(1).max(50).default(10),
    }),
  },
  updateProfile: {
    body: Joi.object().keys({
      businessName: Joi.string().optional().trim(),
      description: Joi.string().optional().allow(''),
      address: Joi.string().optional().allow(''),
      socialLinks: Joi.object().optional(),
      googleBusinessLink: Joi.string().optional().allow('', null),
      workingHours: Joi.string().optional().allow(''),
      products: Joi.array().items(
        Joi.alternatives().try(
          Joi.string().trim(),
          Joi.object({
            name: Joi.string().required().trim(),
            description: Joi.string().optional().allow(''),
            price: Joi.number().optional().allow(null, 0),
            image: Joi.string().optional().allow('', null),
            imageUrl: Joi.string().optional().allow('', null),
            category: Joi.string().optional().allow(''),
            moq: Joi.number().optional().min(1),
            availability: Joi.boolean().optional(),
            specifications: Joi.string().optional().allow(''),
            type: Joi.string().optional().valid('PRODUCT', 'SERVICE')
          }).unknown(true)
        )
      ).optional(),
      keywords: Joi.array().items(Joi.string().trim()).optional(),
      categoryIds: Joi.array().items(Joi.string().uuid()).optional(),
      gstNumber: Joi.string().optional().allow(null, ''),
      aadhaarNumber: Joi.string().optional().allow(null, '').max(12),
      verificationDocument: Joi.string().optional().allow(null, ''),
      logoUrl: Joi.string().optional().allow(null, ''),
    }),
  },
  addFeedback: {
    body: Joi.object().keys({
      vendorId: Joi.string().required().uuid(),
      productId: Joi.string().optional().uuid().allow(null, ''),
      rating: Joi.number().required().min(1).max(5),
      comment: Joi.string().optional().allow(''),
    }),
  },
  addProduct: {
    body: Joi.object().keys({
      name: Joi.string().required().trim(),
      description: Joi.string().optional().allow('', null),
      price: Joi.number().optional().allow(null, 0),
      category: Joi.string().optional().allow('', null),
      image: Joi.string().optional().allow('', null),
      imageUrl: Joi.string().optional().allow('', null),
      moq: Joi.number().optional().min(1),
      availability: Joi.boolean().optional(),
      specifications: Joi.string().optional().allow('', null),
      type: Joi.string().optional().valid('PRODUCT', 'SERVICE'),
      id: Joi.string().optional() // Optional injected ID from frontend loops
    }).unknown(true)
  },
  updateProduct: {
    body: Joi.object().keys({
      name: Joi.string().optional().trim(),
      description: Joi.string().optional().allow('', null),
      price: Joi.number().optional().allow(null, 0),
      category: Joi.string().optional().allow('', null),
      image: Joi.string().optional().allow('', null),
      imageUrl: Joi.string().optional().allow('', null),
      moq: Joi.number().optional().min(1),
      availability: Joi.boolean().optional(),
      specifications: Joi.string().optional().allow('', null),
      type: Joi.string().optional().valid('PRODUCT', 'SERVICE'),
      id: Joi.string().optional()
    }).unknown(true)
  }
};

module.exports = {
  authValidation,
  leadValidation,
  vendorValidation,
};

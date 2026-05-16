const Joi = require("joi");

const leadValidation = {
  createLead: {
    body: Joi.object().keys({
      buyerName: Joi.string().required().trim(),
      phone: Joi.string().required().min(10).max(15),
      city: Joi.string().required().trim(),
      categoryId: Joi.string().required().uuid(),
      searchKeyword: Joi.string().optional().allow(""),
      message: Joi.string().optional().allow(""),
      type: Joi.string().optional().valid("IDLE", "INQUIRY"),
    }),
  },
  createDirectLead: {
    body: Joi.object().keys({
      vendorId: Joi.string().required().uuid(),
      actionType: Joi.string().required().valid("CALL", "WHATSAPP", "CHAT"),
      buyerName: Joi.string().optional().allow(""),
      phone: Joi.string().optional().allow(""),
      city: Joi.string().optional().allow(""),
      categoryId: Joi.string().optional(),
      message: Joi.string().optional().allow(""),
    }),
  },
  updateLeadStatus: {
    body: Joi.object().keys({
      status: Joi.string().required().valid("CLOSED", "REDISTRIBUTE"),
    }),
  },
};

module.exports = leadValidation;

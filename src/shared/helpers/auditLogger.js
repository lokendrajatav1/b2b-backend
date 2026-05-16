const prisma = require('../../config/prisma');

/**
 * Logs an administrative action to the AuditLog table
 * @param {string} userId - ID of the user performing the action
 * @param {string} action - Action performed (e.g., "APPROVE_VENDOR")
 * @param {string} module - Functional module (e.g., "VENDOR", "USER", "OFFERING")
 * @param {object} details - Any additional data or details (will be stringified)
 * @param {string} ipAddress - IP address of the request
 */
const logAction = async (userId, action, module, details = null, ipAddress = null) => {
  try {
     // Ensure details is a string if it's an object
     const detailsString = details && typeof details === 'object' 
        ? JSON.stringify(details) 
        : details;

     await prisma.auditLog.create({
        data: {
           userId,
           action,
           module,
           details: detailsString,
           ipAddress
        }
     });
  } catch (error) {
     console.error('Audit Log Error:', error);
     // We don't throw here to avoid breaking the main request if logging fails
  }
};

module.exports = { logAction };

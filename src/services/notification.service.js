const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Initialize Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Initialize Twilio for WhatsApp
const twilioClient = process.env.TWILIO_ACCOUNT_SID ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

/**
 * Send Email Notification
 */
const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: `B2B Community <${process.env.SMTP_USER}>`,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html,
    };
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Email sending failed:', err);
  }
};

/**
 * Send WhatsApp Notification (via Twilio)
 */
const sendWhatsApp = async (phone, message) => {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    console.log('Twilio not configured. Would have sent WhatsApp to', phone, ':', message);
    return;
  }
  
  try {
    // Ensure phone has country code. Assuming +91 if none provided for India.
    let formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    
    await twilioClient.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:${formattedPhone}`
    });
  } catch (err) {
    console.error('WhatsApp sending failed:', err);
  }
};

/**
 * Comprehensive Lead Notification
 */
const notifyVendorOfLead = async (vendor, lead) => {
  const shortMessage = `Hello ${vendor.businessName}, you have a new ${lead.type} lead from ${lead.buyerName} in ${lead.city}. Log in to view details.`;
  
  // 1. Email Notification
  await sendEmail({
    email: vendor.email,
    subject: '🚀 New Business Lead Received!',
    message: shortMessage,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
        <h2 style="color: #2d3436;">New Lead Distribution</h2>
        <p>Hello <strong>${vendor.businessName}</strong>,</p>
        <p>You have been assigned a new <strong>${lead.type}</strong> lead.</p>
        <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #0984e3;">
          <p><strong>Buyer:</strong> ${lead.buyerName}</p>
          <p><strong>Location:</strong> ${lead.city}</p>
          <p><strong>Keyword:</strong> ${lead.searchKeyword || 'N/A'}</p>
        </div>
        <p>Login to your portal to take action immediately.</p>
        <br>
        <small>B2B Marketplace Platform</small>
      </div>
    `
  });

  // 2. WhatsApp Notification
  await sendWhatsApp(vendor.phone, `🚀 *New ${lead.type} Lead Alert* \n\nHello ${vendor.businessName}, you received a new lead from *${lead.buyerName}* in *${lead.city}*. \n\nPlease login to your dashboard to take action.`);
};

/**
 * Subscription Expiry / Upgrade Notifications
 */
const notifySubscriptionEvent = async (vendor, eventType, details) => {
  let subject = '';
  let htmlBody = '';
  let whatsappMsg = '';

  if (eventType === 'UPGRADE') {
    subject = '🎉 Plan Upgraded Successfully';
    htmlBody = `
      <div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #e0e0e0;border-radius:8px;max-width:600px">
        <h2 style="color:#2e7d32">🎉 Subscription Upgraded!</h2>
        <p>Hello <strong>${vendor.businessName}</strong>,</p>
        <p>Your subscription has been upgraded to <strong>${details.packageName}</strong>.</p>
        <div style="background:#f1f8e9;padding:16px;border-radius:8px;border-left:4px solid #2e7d32;margin:16px 0">
          <p style="margin:0">✅ Ranking priority boosted<br>✅ Expiry: <strong>${details.expiry}</strong></p>
        </div>
        <p>Login to your dashboard to view your updated plan.</p>
        <small style="color:#888">B2B Marketplace Platform</small>
      </div>`;
    whatsappMsg = `🎉 *Plan Upgraded!*\n\nHello ${vendor.businessName}, your subscription has been upgraded to *${details.packageName}*.\n\nExpiry: ${details.expiry}\n\nLogin to your dashboard to view details.`;

  } else if (eventType === 'EXPIRY_WARNING') {
    subject = `⏳ Your Subscription Expires in ${details.daysLeft} Days – Renew Now`;
    htmlBody = `
      <div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #ffe082;border-radius:8px;max-width:600px">
        <div style="background:#fff8e1;padding:16px;border-radius:8px;margin-bottom:16px;border-left:4px solid #f59e0b">
          <h2 style="color:#b45309;margin:0">⏳ Subscription Expiring in ${details.daysLeft} Days</h2>
        </div>
        <p>Hello <strong>${vendor.businessName}</strong>,</p>
        <p>Your <strong>${details.packageName}</strong> subscription will expire on <strong>${details.expiry}</strong>.</p>
        <p>If you do not renew, your listing will be deactivated and you may lose your ranking position and lead access.</p>
        <div style="background:#fafafa;padding:16px;border-radius:8px;border:1px solid #e0e0e0;margin:16px 0">
          <p style="margin:0;font-size:13px;color:#555">
            ⚠️ <strong>What happens if I don't renew?</strong><br>
            Your products will be unlisted, ranking will drop, and lead notifications will stop.
          </p>
        </div>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/vendor/billing"
           style="display:inline-block;margin-top:16px;padding:12px 28px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          Renew Subscription →
        </a>
        <p style="margin-top:24px;font-size:12px;color:#888">B2B Marketplace Platform</p>
      </div>`;
    whatsappMsg = `⏳ *Subscription Expiring Soon!*\n\nHello ${vendor.businessName}, your *${details.packageName}* plan expires in *${details.daysLeft} days* on ${details.expiry}.\n\nPlease renew to keep your listing active and maintain your ranking.\n\n👉 Login to renew: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/vendor/billing`;

  } else if (eventType === 'EXPIRED') {
    subject = '⚠️ Subscription Expired – Renew to Restore Access';
    htmlBody = `
      <div style="font-family:Arial,sans-serif;padding:24px;border:1px solid #ffcdd2;border-radius:8px;max-width:600px">
        <h2 style="color:#c62828">⚠️ Subscription Expired</h2>
        <p>Hello <strong>${vendor.businessName}</strong>,</p>
        <p>Your premium subscription has expired. Your listing has been deactivated and ranking benefits removed.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/vendor/billing"
           style="display:inline-block;margin-top:16px;padding:12px 28px;background:#c62828;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          Renew Now →
        </a>
        <p style="margin-top:24px;font-size:12px;color:#888">B2B Marketplace Platform</p>
      </div>`;
    whatsappMsg = `⚠️ *Subscription Expired!*\n\nHello ${vendor.businessName}, your subscription has expired. Please renew immediately to restore your listing.\n\n👉 ${process.env.FRONTEND_URL || 'http://localhost:3000'}/vendor/billing`;
  }

  await sendEmail({ email: vendor.email, subject, html: htmlBody });
  await sendWhatsApp(vendor.phone, whatsappMsg);
};

/**
 * Vendor Registration Success Notification
 */
const notifyVendorRegistration = async (vendor) => {
  console.log(`[AUTH] 🏪 New Vendor Registration: ${vendor.businessName} (${vendor.email})`);
  
  const subject = '🏪 Welcome to B2B Community Marketplace!';
  const message = `Hello ${vendor.businessName}, your vendor registration has been received successfully. Our team will review your documents and verify your profile soon.`;
  
  // 1. Email
  await sendEmail({
    email: vendor.email,
    subject: subject,
    message: message,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; border: 1px solid #e1e4e8; border-radius: 8px; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Welcome to the Network!</h2>
        <p>Dear <strong>${vendor.businessName}</strong>,</p>
        <p>We are excited to inform you that your vendor registration on the <strong>B2B Community Marketplace</strong> has been successfully submitted.</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #f39c12; font-weight: bold;">Pending Verification</span></p>
          <p style="margin: 5px 0;"><strong>Registration ID:</strong> ${vendor.id}</p>
        </div>

        <p>Our admin team is currently reviewing your application and documents. You will receive another notification once your profile is verified and live.</p>
        
        <p style="margin-top: 30px;">Best Regards,<br><strong>The Admin Team</strong><br>B2B Community Marketplace</p>
      </div>
    `
  });

  // 2. WhatsApp
  await sendWhatsApp(vendor.phone, `🏪 *Welcome to B2B Community!* \n\nHello ${vendor.businessName}, your registration is successful. Status: *Pending Verification*. Our team will review your profile shortly.`);
};

/**
 * Vendor Approval Notification
 */
const notifyVendorApproval = async (vendor, adminRole) => {
  const roleName = adminRole === 'SUPERADMIN' ? 'Super Admin' : 'Admin';
  const subject = `✅ Business Verified: ${vendor.businessName} is now LIVE!`;
  
  await sendEmail({
    email: vendor.user?.email || vendor.email,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; border: 1px solid #e1e4e8; border-radius: 12px; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #007367; border-bottom: 2px solid #007367; padding-bottom: 12px;">Verification Successful!</h2>
        <p>Dear <strong>${vendor.businessName}</strong>,</p>
        <p>We are pleased to inform you that your business profile has been officially verified by the <strong>${roleName}</strong>.</p>
        
        <div style="background: #f0fdf4; padding: 20px; border-radius: 10px; border: 1px solid #bbf7d0; margin: 25px 0;">
          <p style="margin: 0; color: #166534; font-weight: bold; font-size: 16px;">Status: ACTIVE & VERIFIED</p>
          <p style="margin: 8px 0 0 0; color: #166534;">You are now eligible to receive business leads and list unlimited products.</p>
        </div>

        <p>Your listing is now visible to thousands of potential buyers across the network.</p>
        
        <div style="text-align: center; margin-top: 35px;">
           <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/vendor/dashboard" style="background: #007367; color: white; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Go to Dashboard</a>
        </div>

        <p style="margin-top: 40px; border-top: 1px solid #eee; pt-20; font-size: 14px; color: #64748b;">
          Best Regards,<br>
          <strong>The ${roleName} Team</strong><br>
          B2B Community Marketplace
        </p>
      </div>
    `
  });
};

/**
 * Product/Offering Approval Notification
 */
const notifyProductApproval = async (vendor, product, adminRole) => {
  const roleName = adminRole === 'SUPERADMIN' ? 'Super Admin' : 'Admin';
  const subject = `✅ Product Approved: "${product.name}" is now Live!`;

  await sendEmail({
    email: vendor.user?.email || vendor.email,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; border: 1px solid #e1e4e8; border-radius: 12px; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #007367; border-bottom: 2px solid #007367; padding-bottom: 12px;">Listing Approved!</h2>
        <p>Hello <strong>${vendor.businessName}</strong>,</p>
        <p>Great news! Your product <strong>"${product.name}"</strong> has been reviewed and approved by the <strong>${roleName}</strong>.</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0; margin: 25px 0; display: flex; align-items: center; gap: 15px;">
          <div>
            <p style="margin: 0; font-weight: bold;">${product.name}</p>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">Category: ${product.category || 'General'}</p>
          </div>
        </div>

        <p>This product is now publicly visible on the marketplace and ready for inquiries.</p>
        
        <p style="margin-top: 40px; border-top: 1px solid #eee; pt-20; font-size: 14px; color: #64748b;">
          Best Regards,<br>
          <strong>The ${roleName} Team</strong><br>
          B2B Community Marketplace
        </p>
      </div>
    `
  });
};

/**
 * Manual Lead Assignment Notification
 */
const notifyLeadAssignment = async (vendor, lead, adminRole) => {
  const roleName = adminRole === 'SUPERADMIN' ? 'Super Admin' : 'Admin';
  const subject = `🚀 New Priority Lead Assigned to you by ${roleName}`;

  await sendEmail({
    email: vendor.user?.email || vendor.email,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; border: 1px solid #e1e4e8; border-radius: 12px; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #e88c30; border-bottom: 2px solid #e88c30; padding-bottom: 12px;">New Lead Assigned!</h2>
        <p>Hello <strong>${vendor.businessName}</strong>,</p>
        <p>The <strong>${roleName}</strong> has manually assigned a high-priority lead to your business profile.</p>
        
        <div style="background: #fffaf0; padding: 20px; border-radius: 10px; border: 1px solid #feebc8; margin: 25px 0;">
          <p style="margin: 0 0 10px 0; font-weight: bold; color: #9c4221;">Lead Details:</p>
          <p style="margin: 5px 0;"><strong>Buyer Name:</strong> ${lead.buyerName}</p>
          <p style="margin: 5px 0;"><strong>Location:</strong> ${lead.city}</p>
          <p style="margin: 5px 0;"><strong>Requirement:</strong> ${lead.message || 'N/A'}</p>
        </div>

        <p>We recommend contacting the buyer as soon as possible to maximize your chance of conversion.</p>
        
        <div style="text-align: center; margin-top: 30px;">
           <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/vendor/leads" style="background: #e88c30; color: white; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">View Lead Details</a>
        </div>

        <p style="margin-top: 40px; border-top: 1px solid #eee; pt-20; font-size: 14px; color: #64748b;">
          Best Regards,<br>
          <strong>The ${roleName} Team</strong><br>
          B2B Community Marketplace
        </p>
      </div>
    `
  });
};

module.exports = { 
  sendEmail, 
  sendWhatsApp, 
  notifyVendorOfLead,
  notifySubscriptionEvent,
  notifyVendorRegistration,
  notifyVendorApproval,
  notifyProductApproval,
  notifyLeadAssignment
};

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
  let title = '';
  let message = '';

  if (eventType === 'UPGRADE') {
    title = '🎉 Plan Upgraded Successfully';
    message = `Your subscription has been upgraded to ${details.packageName}. Your ranking priority is now boosted. Expiry: ${details.expiry}`;
  } else if (eventType === 'EXPIRY_WARNING') {
    title = `⏳ Subscription Expiring in ${details.daysLeft} Days`;
    message = `Your package will expire soon. Please renew to avoid losing your ranking and priority leads.`;
  } else if (eventType === 'EXPIRED') {
    title = '⚠️ Subscription Expired';
    message = `Your premium subscription has expired. You have been downgraded and lost ranking benefits. Renew now!`;
  }

  // 1. Email
  await sendEmail({
    email: vendor.email,
    subject: title,
    message: message,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
        <h2 style="color: #2d3436;">${title}</h2>
        <p>Hello <strong>${vendor.businessName}</strong>,</p>
        <p>${message}</p>
        <br>
        <small>B2B Marketplace Platform</small>
      </div>
    `
  });

  // 2. WhatsApp
  await sendWhatsApp(vendor.phone, `*${title}*\n\nHello ${vendor.businessName},\n${message}`);
};

module.exports = { 
  sendEmail, 
  sendWhatsApp, 
  notifyVendorOfLead,
  notifySubscriptionEvent 
};

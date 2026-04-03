const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

/**
 * Generate PDF Invoice and Upload to Cloudinary
 */
const generateInvoice = (transaction, vendor, pkg) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);

        // Upload to Cloudinary directly from buffer
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'b2b_invoices',
            public_id: `invoice_${transaction.razorpayOrderId}`,
            format: 'pdf',
          },
          (error, result) => {
            if (error) {
              console.error('Invoice URL Generation Failed:', error);
              return reject(error);
            }
            resolve(result.secure_url);
          }
        ).end(pdfData);
      });

      // ---- PDF Design ----
      doc.fontSize(20).text('INVOICE', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Invoice No: INV-${transaction.razorpayOrderId}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.moveDown();

      doc.text(`Billed To:`);
      doc.text(`Business Name: ${vendor.businessName}`);
      doc.text(`Email: ${vendor.email}`);
      doc.text(`Phone: ${vendor.phone}`);
      if (vendor.address) doc.text(`Address: ${vendor.address}`);
      if (vendor.gstNumber) doc.text(`GST Number: ${vendor.gstNumber}`);
      doc.moveDown();

      // Table Header
      const tableTop = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Description', 50, tableTop);
      doc.text('Amount', 400, tableTop, { align: 'right' });
      
      // Table Content
      const itemTop = tableTop + 20;
      doc.font('Helvetica');
      doc.text(`Subscription Package: ${pkg.name}`, 50, itemTop);
      doc.text(`INR ${transaction.amount.toFixed(2)}`, 400, itemTop, { align: 'right' });

      doc.moveDown(2);
      doc.font('Helvetica-Bold');
      doc.text(`Total Amount Paid: INR ${transaction.amount.toFixed(2)}`, { align: 'right' });
      
      doc.moveDown(4);
      doc.font('Helvetica-Oblique').text('Thank you for subscribing to B2B Community Marketplace.', { align: 'center' });
      doc.text('This is an auto-generated invoice.', { align: 'center' });

      // Finalize PDF
      doc.end();

    } catch (err) {
      console.error('PDF Generation pipeline error:', err);
      reject(err);
    }
  });
};

module.exports = { generateInvoice };

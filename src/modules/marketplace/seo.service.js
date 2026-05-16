const prisma = require('../../config/prisma');

/**
 * Generate JSON-LD Schema for Vendor Profile
 */
exports.generateVendorSchema = (vendor) => {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": vendor.businessName,
    "image": vendor.gallery?.[0]?.url || "",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": vendor.city,
      "streetAddress": vendor.address || ""
    },
    "url": `${process.env.FRONTEND_URL}/vendor/${vendor.id}`,
    "telephone": vendor.phone,
    "description": vendor.description
  };
};

/**
 * Generate JSON-LD Schema for Products
 */
exports.generateProductSchema = (product, vendor) => {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": `Buy ${product.name} from ${vendor.businessName} in ${vendor.city}`,
    "brand": {
      "@type": "Brand",
      "name": vendor.businessName
    }
  };
};

/**
 * Google Merchant Product Feed Generator (Simplified JSON)
 */
exports.generateMerchantFeed = async () => {
  const vendors = await prisma.vendor.findMany({
    where: { verified: true },
    include: { products: true, categories: true }
  });

  const items = [];
  vendors.forEach(vendor => {
    vendor.products.forEach(product => {
      items.push({
        id: product.id,
        title: product.name,
        description: `Verified product from ${vendor.businessName}`,
        link: `${process.env.FRONTEND_URL}/vendors/${vendor.id}`,
        image_link: vendor.gallery?.[0]?.url || "",
        availability: "in stock",
        price: "Contact for Quote",
        brand: vendor.businessName,
        google_product_category: vendor.categories[0]?.name || "B2B Marketplace"
      });
    });
  });

  return items;
};

/**
 * Cloudinary Optimized Image URL Helper
 */
exports.getOptimizedImageUrl = (url) => {
  if (!url || !url.includes('cloudinary')) return url;
  // Inject transformation: f_auto (auto format - webp/avif), q_auto (auto quality/compression)
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
};

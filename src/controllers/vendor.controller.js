const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const ApiResponse = require('../utils/ApiResponse');
const AppError = require('../utils/AppError');
const { encrypt, decrypt } = require('../utils/encryption');

// Register Vendor
exports.registerVendor = catchAsync(async (req, res, next) => {
  const { 
    businessName, email, phone, gstNumber, aadhaarNumber, 
    city, categoryIds, description, address, socialLinks, 
    googleBusinessLink, workingHours, logoUrl 
  } = req.body;

  // Check if user already has a vendor profile
  const existingVendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id }
  });

  if (existingVendor) {
    return next(new AppError('Vendor profile already exists for this user', 400));
  }

  // Encrypt sensitive info
  const encryptedGst = encrypt(gstNumber);
  const encryptedAadhaar = encrypt(aadhaarNumber);

  const vendor = await prisma.vendor.create({
    data: {
      userId: req.user.id,
      businessName,
      email,
      phone,
      gstNumber: encryptedGst,
      aadhaarNumber: encryptedAadhaar,
      city,
      categories: {
        connect: (categoryIds || []).map(id => ({ id }))
      },
      description,
      address,
      socialLinks,
      googleBusinessLink,
      workingHours,
      logoUrl,
      profileCompleteness: 40 // Initial profile completeness
    },
    include: { categories: true }
  });

  const responseVendor = {
    ...vendor,
    gstNumber: vendor.gstNumber ? decrypt(vendor.gstNumber) : null,
    aadhaarNumber: vendor.aadhaarNumber ? decrypt(vendor.aadhaarNumber) : null
  };

  res.status(201).json(new ApiResponse(201, responseVendor, "Vendor registration submitted. Pending admin approval."));
});


// Search Vendors
exports.searchVendors = catchAsync(async (req, res, next) => {
  const { city, categoryId, search, offeringType, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const where = {
    verified: true // Only show verified vendors by default
  };

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }
  if (categoryId) {
    where.categories = {
      some: { id: categoryId }
    };
  }
  if (offeringType) {
    where.products = {
      some: { type: offeringType, status: 'APPROVED' }
    };
  }
  if (search) {
    where.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { keywords: { some: { name: { contains: search, mode: 'insensitive' } } } },
      { products: { some: { name: { contains: search, mode: 'insensitive' }, status: 'APPROVED' } } }
    ];
  }

  const cacheKey = `search:vendors:${city || ''}:${categoryId || ''}:${search || ''}:${offeringType || ''}:${page}:${limit}`;
  const cacheService = require('../services/cache.service');
  
  // Try Cache First
  const cachedData = await cacheService.getCache(cacheKey);
  if (cachedData) {
    return res.status(200).json(new ApiResponse(200, cachedData, "Fetched from cache"));
  }

  const vendors = await prisma.vendor.findMany({
    where,
    include: { 
      categories: true, 
      reviews: { include: { user: true } }, 
      products: { where: { status: 'APPROVED' } },
      gallery: true
    },
    skip: parseInt(skip),
    take: parseInt(limit),
    orderBy: { totalScore: 'desc' }
  });

  const total = await prisma.vendor.count({ where });

  const responseData = {
    vendors,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit)
  };

  // Set Cache (expires in 1 minute instead of 15 for better UI reactivity)
  await cacheService.setCache(cacheKey, responseData, 60);

  res.status(200).json(new ApiResponse(200, responseData));
});

// Get Single Vendor
exports.getVendorById = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { 
      categories: true, 
      reviews: { include: { user: true, product: true }, orderBy: { createdAt: 'desc' } }, 
      products: { where: { status: 'APPROVED' } },
      gallery: true,
      certifications: true,
      package: true
    }
  });

  if (!vendor) return next(new AppError('Vendor not found', 404));

  // Mask sensitive data for unauthenticated users (Requirement 3.3)
  if (!req.user) {
    vendor.phone = '**********';
    vendor.email = vendor.email.replace(/(.{2}).*(@.*)/, '$1***$2');
  }

  res.status(200).json(new ApiResponse(200, vendor));
});

// Get My Profile (Vendor)
exports.getMyProfile = catchAsync(async (req, res, next) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id },
    include: { 
      package: true, 
      products: true, 
      keywords: true,
      gallery: true, 
      certifications: true,
      categories: true
    }
  });

  if (!vendor) return res.status(200).json(new ApiResponse(200, null, 'No vendor profile yet'));

  // Decrypt sensitive fields for the vendor's own view
  const decryptedVendor = {
    ...vendor,
    gstNumber: vendor.gstNumber ? decrypt(vendor.gstNumber) : null,
    aadhaarNumber: vendor.aadhaarNumber ? decrypt(vendor.aadhaarNumber) : null
  };

  res.status(200).json(new ApiResponse(200, decryptedVendor));
});

// Update Profile
exports.updateMyProfile = catchAsync(async (req, res, next) => {
  const { 
    businessName, description, address, 
    socialLinks, googleBusinessLink, workingHours,
    products, keywords, categoryIds, verificationDocument,
    gstNumber, aadhaarNumber, logoUrl
  } = req.body;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id },
    include: { categories: true }
  });

  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  // Update Products if provided
  if (products && Array.isArray(products)) {
    console.log(`[DEBUG] Syncing ${products.length} offerings for vendor: ${vendor.id}`);
    
    // Capture current approval states before rebuild
    const snapshot = await prisma.product.findMany({
        where: { vendorId: vendor.id },
        select: { name: true, status: true }
    });
    const statusMap = Object.fromEntries(snapshot.map(s => [s.name, s.status]));

    await prisma.product.deleteMany({ where: { vendorId: vendor.id } });
    if (products.length > 0) {
      const dataToInject = products.map(p => {
        const data = typeof p === 'object' ? p : { name: p };
        return {
            name: data.name || 'Untitled Offering',
            description: data.description || '',
            price: parseFloat(data.price) || 0,
            category: data.category || (vendor.categories && vendor.categories[0]?.name) || '',
            imageUrl: data.image || data.imageUrl || '',
            moq: parseInt(data.moq) || 1,
            availability: data.availability !== undefined ? !!data.availability : true,
            specifications: data.specifications || '',
            type: data.type === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
            status: statusMap[data.name] || 'PENDING', // Re-apply existing status or default to pending
            vendorId: vendor.id
        };
      });
      
      await prisma.product.createMany({ data: dataToInject });
      console.log(`[DEBUG] Re-synchronized ${dataToInject.length} offerings into matrix with status preservation`);
    }
  }

  // Update Keywords if provided
  if (keywords) {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        keywords: {
          set: [],
          connectOrCreate: keywords.map(name => ({
            where: { name },
            create: { name }
          }))
        }
      }
    });
  }

  // Update Other Profile Fields — only include defined values
  const updateData = {};
  if (businessName !== undefined) updateData.businessName = businessName;
  if (description !== undefined) updateData.description = description;
  if (address !== undefined) updateData.address = address;
  if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
  if (googleBusinessLink !== undefined) updateData.googleBusinessLink = typeof googleBusinessLink === 'string' ? googleBusinessLink : '';
  if (workingHours !== undefined) updateData.workingHours = workingHours;
  if (verificationDocument !== undefined) updateData.verificationDocument = verificationDocument;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
  if (gstNumber !== undefined) updateData.gstNumber = gstNumber ? encrypt(gstNumber) : null;
  if (aadhaarNumber !== undefined) updateData.aadhaarNumber = aadhaarNumber ? encrypt(aadhaarNumber) : null;

  // Sync Categories if provided (Multi-category support)
  if (categoryIds && Array.isArray(categoryIds)) {
    updateData.categories = {
      set: [], // Clear old
      connect: categoryIds.map(id => ({ id })) // Connect new
    };
  }

  const updatedVendor = await prisma.vendor.update({
    where: { id: vendor.id },
    data: updateData,
    include: { categories: true, products: true, keywords: true }
  });

  const responseVendor = {
    ...updatedVendor,
    gstNumber: updatedVendor.gstNumber ? decrypt(updatedVendor.gstNumber) : null,
    aadhaarNumber: updatedVendor.aadhaarNumber ? decrypt(updatedVendor.aadhaarNumber) : null
  };

  const cacheService = require('../services/cache.service');
  await cacheService.clearCacheByPrefix('search:vendors');

  res.status(200).json(new ApiResponse(200, responseVendor, "Profile updated successfully"));
});

// Sensitive Info Change
exports.updateSensitiveInfo = catchAsync(async (req, res, next) => {
  const { gstNumber, aadhaarNumber } = req.body;
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id }
  });

  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  const data = {};
  if (gstNumber) data.gstNumber = encrypt(gstNumber);
  if (aadhaarNumber) data.aadhaarNumber = encrypt(aadhaarNumber);

  await prisma.vendor.update({
    where: { id: vendor.id },
    data
  });

  res.status(200).json(new ApiResponse(200, null, "Sensitive information updated. Pending verification."));
});

// Add Single Product/Service
exports.addProduct = catchAsync(async (req, res, next) => {
    const { 
        name, description, price, category, imageUrl, 
        image, moq, availability, specifications, type 
    } = req.body;

    const vendor = await prisma.vendor.findUnique({
        where: { userId: req.user.id },
        include: { categories: true }
    });

    if (!vendor) return next(new AppError('Vendor profile not found', 404));

    const product = await prisma.product.create({
        data: {
            name: name || 'Untitled Offering',
            description: description || '',
            price: parseFloat(price) || 0,
            category: category || (vendor.categories && vendor.categories[0]?.name) || '',
            imageUrl: image || imageUrl || '', // Support both keys
            moq: parseInt(moq) || 1,
            availability: availability !== undefined ? !!availability : true,
            specifications: specifications || '',
            type: type === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
            vendorId: vendor.id
        }
    });

    res.status(201).json(new ApiResponse(201, product, "Asset added to database successfully"));
});

exports.updateProduct = catchAsync(async (req, res, next) => {
    const { productId } = req.params;
    const { 
        name, description, price, category, imageUrl, 
        image, moq, availability, specifications, type 
    } = req.body;

    const vendor = await prisma.vendor.findUnique({
        where: { userId: req.user.id },
        include: { categories: true }
    });

    if (!vendor) return next(new AppError('Vendor profile not found', 404));

    const product = await prisma.product.update({
        where: { id: productId, vendorId: vendor.id },
        data: {
            name,
            description,
            price: parseFloat(price) || 0,
            category: category || (vendor.categories && vendor.categories[0]?.name) || '',
            imageUrl: image || imageUrl,
            moq: parseInt(moq) || 1,
            availability: availability !== undefined ? !!availability : true,
            specifications,
            type
        }
    });

    res.status(200).json(new ApiResponse(200, product, "Asset updated successfully"));
});

// Public: Get single product by ID (Check status)
exports.getProductById = catchAsync(async (req, res, next) => {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
            reviews: { include: { user: true }, orderBy: { createdAt: 'desc' } },
            vendor: {
                include: {
                    categories: true,
                    reviews: { orderBy: { createdAt: 'desc' } },
                    gallery: { take: 3 }
                }
            }
        }
    });

    if (!product) return next(new AppError('Product not found', 404));

    // Enforcement: Only approved products are public. 
    // Exceptions: Vendor who owns it, or Admin/Subadmin
    const isOwner = req.user && req.user.id === product.vendor.userId;
    const isAdmin = req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUBADMIN');

    if (product.status !== 'APPROVED' && !isOwner && !isAdmin) {
        return next(new AppError('This offering is pending approval and is not yet public.', 403));
    }

    // Mask sensitive data for unauthenticated or non-owner/admin users
    if (!req.user || (!isOwner && !isAdmin)) {
      product.vendor.phone = '**********';
      product.vendor.email = product.vendor.email.replace(/(.{2}).*(@.*)/, '$1***$2');
    }

    res.status(200).json(new ApiResponse(200, product, 'Product fetched successfully'));
});

exports.deleteProduct = catchAsync(async (req, res, next) => {
    const { productId } = req.params;
    const vendor = await prisma.vendor.findUnique({
        where: { userId: req.user.id }
    });

    if (!vendor) return next(new AppError('Vendor profile not found', 404));

    await prisma.product.delete({
        where: { id: productId, vendorId: vendor.id }
    });

    res.status(200).json(new ApiResponse(200, null, "Asset removed from database"));
});

// Gallery Management
exports.addGalleryImages = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new AppError('Please upload at least one image', 400));
  }

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id }
  });

  const images = req.files.map(file => ({
    vendorId: vendor.id,
    url: file.path,
    publicId: file.filename
  }));

  await prisma.galleryImage.createMany({ data: images });

  res.status(201).json(new ApiResponse(201, images, "Images added to gallery"));
});

exports.removeGalleryImage = catchAsync(async (req, res, next) => {
  const { imageId } = req.params;
  await prisma.galleryImage.delete({ where: { id: imageId } });
  res.status(200).json(new ApiResponse(200, null, "Image removed from gallery"));
});

// Certification Management
exports.addCertification = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please upload a certification document', 400));
  
  const { name } = req.body;
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id }
  });

  const certification = await prisma.certification.create({
    data: {
      vendorId: vendor.id,
      name: name || 'Certification',
      url: req.file.path
    }
  });

  res.status(201).json(new ApiResponse(201, certification, "Certification added"));
});

const leadService = require('../services/lead.service');

// Feedback System
exports.addReview = catchAsync(async (req, res, next) => {
  const { vendorId, productId, rating, comment } = req.body;
  
  const review = await prisma.review.create({
    data: {
      userId: req.user.id,
      vendorId,
      productId: productId || null,
      rating,
      comment
    }
  });

  // Proper Ranking Recalculation
  await leadService.recalculateRankings(vendorId);

  res.status(201).json(new ApiResponse(201, review, "Review added"));
});


exports.getPackages = catchAsync(async (req, res, next) => {
    const packages = await prisma.package.findMany();
    res.status(200).json(new ApiResponse(200, packages));
});

exports.getAllCategories = catchAsync(async (req, res, next) => {
    const cacheService = require('../services/cache.service');
    const cacheKey = 'app:all_categories';
    
    let categories = await cacheService.getCache(cacheKey);
    if (!categories) {
        categories = await prisma.category.findMany({
            orderBy: { name: 'asc' }
        });
        await cacheService.setCache(cacheKey, categories, 3600); // Cache for 1 hour
    }
    
    res.status(200).json(new ApiResponse(200, categories));
});

exports.uploadProductImage = catchAsync(async (req, res, next) => {
    if (!req.file) return next(new AppError('Please upload an image', 400));
    res.status(200).json(new ApiResponse(200, { url: req.file.path }, "Image uploaded successfully"));
});

exports.addFeedback = exports.addReview;

/**
 * Vendor Analytics & Performance
 */
exports.getVendorAnalytics = catchAsync(async (req, res, next) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id },
    include: { categories: true }
  });

  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  // 1. Lead Distribution Stats
  const leadStats = await prisma.lead.groupBy({
    by: ['status'],
    where: { vendorId: vendor.id },
    _count: { id: true }
  });

  // 2. Recent Performance Score Trend (Mocked or from Ranking table)
  const rankings = await prisma.ranking.findMany({
    where: { vendorId: vendor.id },
    take: 7,
    orderBy: { date: 'desc' }
  });

  // 3. Category Context (avg score in their category)
  const categoryAvg = await prisma.vendor.aggregate({
    where: { categories: { some: { id: { in: vendor.categories.map(c => c.id) } } }, verified: true },
    _avg: { totalScore: true }
  });

  res.status(200).json(new ApiResponse(200, {
    leads: leadStats,
    rankings: rankings.reverse(),
    categoryBenchmark: categoryAvg._avg.totalScore || 0
  }, "Performance analytics synchronized"));
});

const prisma = require("../../../config/prisma");
const catchAsync = require("../../../shared/helpers/catch-async");
const AppError = require("../../../shared/errors/app-error");
const ApiResponse = require("../../../shared/helpers/api-response");
const { encrypt, decrypt } = require("../../../shared/helpers/encryption"); // Need to ensure encryption helper is in shared
const notificationService = require("../../../modules/notifications/notifications.service");
const leadService = require("../../../modules/leads/leads.service");
const cacheService = require("../../../services/cache.service");

// Register Vendor
exports.registerVendor = catchAsync(async (req, res, next) => {
  const { 
    businessName, email, phone, gstNumber, aadhaarNumber, 
    city, categoryIds, description, address, socialLinks, 
    googleBusinessLink, workingHours, logoUrl 
  } = req.body;

  const existingVendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id }
  });

  if (existingVendor) {
    return next(new AppError('Vendor profile already exists for this user', 400));
  }

  const encryptedGst = gstNumber ? encrypt(gstNumber) : null;
  const encryptedAadhaar = aadhaarNumber ? encrypt(aadhaarNumber) : null;

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
      profileCompleteness: 40
    },
    include: { categories: true }
  });

  const responseVendor = {
    ...vendor,
    gstNumber: vendor.gstNumber ? decrypt(vendor.gstNumber) : null,
    aadhaarNumber: vendor.aadhaarNumber ? decrypt(vendor.aadhaarNumber) : null
  };

  await notificationService.notifyVendorRegistration(responseVendor);
  
  res.status(201).json(new ApiResponse(201, responseVendor, "Vendor registration submitted."));
});

// Search Vendors
exports.searchVendors = catchAsync(async (req, res, next) => {
  const { city, categoryId, search, offeringType, verified, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const andConditions = [];
  if (verified === 'true') andConditions.push({ verified: true });

  if (city) {
    andConditions.push({ city: { contains: city.trim(), mode: 'insensitive' } });
  }
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (category) {
      andConditions.push({
        OR: [
          { categories: { some: { id: categoryId } } },
          { products: { some: { category: category.name, status: 'APPROVED' } } }
        ]
      });
    } else {
      andConditions.push({ categories: { some: { id: categoryId } } });
    }
  }
  if (offeringType) {
    andConditions.push({ products: { some: { type: offeringType, status: 'APPROVED' } } });
  }
  if (search) {
    andConditions.push({
      OR: [
        { businessName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { keywords: { some: { name: { contains: search, mode: 'insensitive' } } } },
        { products: { some: { name: { contains: search, mode: 'insensitive' }, status: 'APPROVED' } } },
        { products: { some: { category: { contains: search, mode: 'insensitive' }, status: 'APPROVED' } } },
        { categories: { some: { name: { contains: search, mode: 'insensitive' } } } }
      ]
    });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const cacheKey = `search:vendors:${city || ''}:${categoryId || ''}:${search || ''}:${offeringType || ''}:${verified || ''}:${page}:${limit}`;
  const cachedData = await cacheService.getCache(cacheKey);
  if (cachedData) {
    return res.status(200).json(new ApiResponse(200, cachedData, "Fetched from cache"));
  }

  const vendors = await prisma.vendor.findMany({
    where,
    include: { 
      categories: true, 
      products: { where: { status: 'APPROVED' } },
      package: true
    },
    skip: parseInt(skip),
    take: parseInt(limit),
    orderBy: [
      { package: { priority: 'desc' } },
      { totalScore: 'desc' }
    ]
  });

  const total = await prisma.vendor.count({ where });

  const responseData = {
    vendors,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit)
  };

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
      reviewsReceived: { 
        include: { user: true }, 
        orderBy: { createdAt: 'desc' },
        take: 5 
      }, 
      products: { where: { status: 'APPROVED' } },
      gallery: { take: 10 },
      certifications: true,
      package: true
    }
  });

  if (!vendor) return next(new AppError('Vendor not found', 404));

  if (!req.user) {
    vendor.phone = '**********';
    vendor.email = vendor.email.replace(/(.{2}).*(@.*)/, '$1***$2');
  }

  res.status(200).json(new ApiResponse(200, vendor));
});

// Get My Profile
exports.getMyProfile = catchAsync(async (req, res, next) => {
  let vendor = await prisma.vendor.findUnique({
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

  if (!vendor && req.user.role === 'VENDOR') {
    const userRecord = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (userRecord) {
      const basicPackage = await prisma.package.findFirst({
        where: { name: 'Basic' }
      });

      const firstCategory = await prisma.category.findFirst();

      vendor = await prisma.vendor.create({
        data: {
          userId: req.user.id,
          businessName: userRecord.name || 'My Business',
          email: userRecord.email || '',
          phone: userRecord.phone || '',
          city: 'Indore',
          verified: true,
          status: 'VERIFIED',
          profileCompleteness: 50,
          packageId: basicPackage ? basicPackage.id : null,
          planExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          categories: firstCategory ? {
            connect: [{ id: firstCategory.id }]
          } : undefined
        },
        include: {
          package: true,
          products: true,
          keywords: true,
          gallery: true,
          certifications: true,
          categories: true
        }
      });
    }
  }

  if (!vendor) return res.status(200).json(new ApiResponse(200, null, 'No vendor profile yet'));

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
    businessName, description, address, phone, city,
    socialLinks, googleBusinessLink, workingHours,
    products, keywords, categoryIds, verificationDocument,
    gstNumber, aadhaarNumber, logoUrl
  } = req.body;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id },
    include: { categories: true }
  });

  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  if (products && Array.isArray(products)) {
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
            images: Array.isArray(data.images) ? data.images.slice(0, 5) : [],
            moq: parseInt(data.moq) || 1,
            availability: data.availability !== undefined ? !!data.availability : true,
            specifications: data.specifications || '',
            type: data.type === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
            status: statusMap[data.name] || 'PENDING',
            vendorId: vendor.id
        };
      });
      await prisma.product.createMany({ data: dataToInject });
    }
  }

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

  const updateData = {};
  if (businessName !== undefined) updateData.businessName = businessName;
  if (phone !== undefined && phone !== '') updateData.phone = phone;
  if (city !== undefined) updateData.city = city;
  if (description !== undefined) updateData.description = description;
  if (address !== undefined) updateData.address = address;
  if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
  if (googleBusinessLink !== undefined) updateData.googleBusinessLink = googleBusinessLink;
  if (workingHours !== undefined) updateData.workingHours = workingHours;
  if (verificationDocument !== undefined) updateData.verificationDocument = verificationDocument;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
  if (gstNumber !== undefined) updateData.gstNumber = gstNumber ? encrypt(gstNumber) : null;
  if (aadhaarNumber !== undefined) updateData.aadhaarNumber = aadhaarNumber ? encrypt(aadhaarNumber) : null;

  if (categoryIds && Array.isArray(categoryIds)) {
    updateData.categories = {
      set: [],
      connect: categoryIds.map(id => ({ id }))
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

  res.status(200).json(new ApiResponse(200, null, "Sensitive info updated."));
});

// Add Single Product
exports.addProduct = catchAsync(async (req, res, next) => {
    const { 
        name, description, price, category, images,
        moq, availability, specifications, type 
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
            images: Array.isArray(images) ? images.slice(0, 5) : [],
            moq: parseInt(moq) || 1,
            availability: availability !== undefined ? !!availability : true,
            specifications: specifications || '',
            type: type === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
            vendorId: vendor.id
        }
    });

    res.status(201).json(new ApiResponse(201, product, "Asset added successfully"));
});

exports.updateProduct = catchAsync(async (req, res, next) => {
    const { productId } = req.params;
    const { 
        name, description, price, category, images,
        moq, availability, specifications, type 
    } = req.body;

    const vendor = await prisma.vendor.findUnique({
        where: { userId: req.user.id }
    });

    if (!vendor) return next(new AppError('Vendor profile not found', 404));

    const product = await prisma.product.update({
        where: { id: productId, vendorId: vendor.id },
        data: {
            name,
            description,
            price: parseFloat(price) || 0,
            category,
            images: Array.isArray(images) ? images.slice(0, 5) : [],
            moq: parseInt(moq) || 1,
            availability: availability !== undefined ? !!availability : true,
            specifications,
            type
        }
    });

    await cacheService.deleteCache(`product:${productId}`);

    res.status(200).json(new ApiResponse(200, product, "Asset updated successfully"));
});

exports.getProductById = catchAsync(async (req, res, next) => {
    const { productId } = req.params;
    const cacheKey = `product:${productId}`;

    let product = await cacheService.getCache(cacheKey);

    if (!product) {
        product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                reviews: { include: { user: true }, take: 10 },
                vendor: { include: { categories: true, gallery: { take: 3 } } }
            }
        });

        if (product) {
            await cacheService.setCache(cacheKey, product, 300);
        }
    }

    if (!product) return next(new AppError('Product not found', 404));

    const isOwner = req.user && req.user.id === product.vendor.userId;
    const isAdmin = req.user && (req.user.role === 'SUPERADMIN' || req.user.role === 'ADMIN');

    if (product.status !== 'APPROVED' && !isOwner && !isAdmin) {
        return next(new AppError('Product pending approval.', 403));
    }

    if (!req.user || (!isOwner && !isAdmin)) {
      product.vendor.phone = '**********';
      product.vendor.email = product.vendor.email.replace(/(.{2}).*(@.*)/, '$1***$2');
    }

    res.status(200).json(new ApiResponse(200, product));
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

    res.status(200).json(new ApiResponse(200, null, "Asset removed"));
});

// Gallery Management
exports.addGalleryImages = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next(new AppError('Upload images', 400));

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });

  const images = req.files.map(file => ({
    vendorId: vendor.id,
    url: file.path,
    publicId: file.filename
  }));

  await prisma.galleryImage.createMany({ data: images });
  res.status(201).json(new ApiResponse(201, images, "Images added"));
});

exports.removeGalleryImage = catchAsync(async (req, res, next) => {
  const { imageId } = req.params;
  await prisma.galleryImage.delete({ where: { id: imageId } });
  res.status(200).json(new ApiResponse(200, null, "Image removed"));
});

exports.addCertification = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Upload certification', 400));
  
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });

  const certification = await prisma.certification.create({
    data: {
      vendorId: vendor.id,
      name: req.body.name || 'Certification',
      url: req.file.path
    }
  });

  res.status(201).json(new ApiResponse(201, certification, "Certification added"));
});

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

  await leadService.recalculateRankings(vendorId);
  res.status(201).json(new ApiResponse(201, review, "Review added"));
});

exports.getPackages = catchAsync(async (req, res, next) => {
    const packages = await prisma.package.findMany();
    res.status(200).json(new ApiResponse(200, packages));
});

exports.getAllCategories = catchAsync(async (req, res, next) => {
    const cacheKey = 'app:all_categories';
    let categories = await cacheService.getCache(cacheKey);
    if (!categories) {
        categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
        await cacheService.setCache(cacheKey, categories, 3600);
    }
    res.status(200).json(new ApiResponse(200, categories));
});

exports.uploadProductImage = catchAsync(async (req, res, next) => {
    if (!req.file) return next(new AppError('Upload image', 400));
    res.status(200).json(new ApiResponse(200, { url: req.file.path }));
});

exports.addFeedback = exports.addReview;

exports.getVendorAnalytics = catchAsync(async (req, res, next) => {
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id },
    include: { categories: true, products: true }
  });

  if (!vendor) return next(new AppError('Vendor not found', 404));

  const leadStats = await prisma.lead.groupBy({
    by: ['status'],
    where: { vendorId: vendor.id },
    _count: { id: true }
  });

  let categoryRank = 0;
  if (vendor.categories.length > 0) {
    categoryRank = await prisma.vendor.count({
      where: {
        categories: { some: { id: vendor.categories[0].id } },
        totalScore: { gt: vendor.totalScore }
      }
    }) + 1;
  }

  const rankings = await prisma.ranking.findMany({
    where: { vendorId: vendor.id },
    take: 7,
    orderBy: { date: 'desc' }
  });

  const totalLeads = await prisma.lead.count({ where: { vendorId: vendor.id } });
  const respondedLeads = await prisma.lead.count({ 
    where: { vendorId: vendor.id, status: { not: 'PENDING' } } 
  });
  const responseRate = totalLeads > 0 ? Math.round((respondedLeads / totalLeads) * 100) : 100;

  res.status(200).json(new ApiResponse(200, {
    leads: leadStats,
    totalLeads,
    categoryRank: `#${categoryRank}`,
    responseRate: `${responseRate}%`,
    rankings: rankings.length > 0 ? rankings.reverse() : [],
    profileCompleteness: vendor.profileCompleteness || 40
  }));
});

exports.getCities = catchAsync(async (req, res, next) => {
  const vendors = await prisma.vendor.findMany({
    select: { city: true },
    distinct: ['city']
  });
  
  const cities = vendors
    .map(v => v.city)
    .filter(Boolean)
    .sort();
    
  res.status(200).json(new ApiResponse(200, cities));
});

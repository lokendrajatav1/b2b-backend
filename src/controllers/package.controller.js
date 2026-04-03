const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Public: Get all available packages for vendors to subscribe
 */
exports.getAllPackages = catchAsync(async (req, res, next) => {
  const packages = await prisma.package.findMany({
    orderBy: { price: 'asc' }
  });

  res.status(200).json(new ApiResponse(200, packages));
});

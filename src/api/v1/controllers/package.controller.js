const prisma = require('../../../config/prisma');
const catchAsync = require('../../../shared/helpers/catch-async');
const ApiResponse = require('../../../shared/helpers/api-response');

/**
 * Public: Get all available packages for vendors to subscribe
 */
exports.getAllPackages = catchAsync(async (req, res, next) => {
  const packages = await prisma.package.findMany({
    orderBy: { price: 'asc' }
  });

  res.status(200).json(new ApiResponse(200, packages));
});

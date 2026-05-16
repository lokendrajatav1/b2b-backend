const prisma = require("../../../config/prisma");
const catchAsync = require("../../../shared/helpers/catch-async");
const ApiResponse = require("../../../shared/helpers/api-response");

exports.getAllCategories = catchAsync(async (req, res, next) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { vendors: true }
      }
    }
  });

  res.status(200).json(new ApiResponse(200, categories, "Categories fetched successfully"));
});

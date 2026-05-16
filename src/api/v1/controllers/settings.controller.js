const prisma = require('../../../config/prisma');
const catchAsync = require('../../../shared/helpers/catch-async');
const ApiResponse = require('../../../shared/helpers/api-response');

exports.getGlobalSettings = catchAsync(async (req, res) => {
  let settings = await prisma.systemSettings.findUnique({
    where: { id: 'global' },
  });

  if (!settings) {
    settings = await prisma.systemSettings.create({
      data: { id: 'global' },
    });
  }

  res.status(200).json(new ApiResponse(200, settings));
});

exports.updateGlobalSettings = catchAsync(async (req, res) => {
  const data = req.body;
  
  const settings = await prisma.systemSettings.upsert({
    where: { id: 'global' },
    update: data,
    create: {
      id: 'global',
      ...data
    }
  });

  res.status(200).json(new ApiResponse(200, settings, 'Global settings updated successfully'));
});

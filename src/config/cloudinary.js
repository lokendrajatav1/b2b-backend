const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Custom storage engine to mimic multer-storage-cloudinary
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

/**
 * Middleware to upload multiple or single files to Cloudinary
 * attaches .path to the file objects to maintain compatibility
 */
const handleCloudinaryUpload = async (req, res, next) => {
  if (!req.file && (!req.files || req.files.length === 0)) {
    return next();
  }

  const uploadToCloudinary = (file) => {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: process.env.CLOUDINARY_FOLDER || 'b2b-marketplace',
          allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'avif', 'webp'],
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );

      const stream = new Readable();
      stream.push(file.buffer);
      stream.push(null);
      stream.pipe(uploadStream);
    });
  };

  try {
    if (req.file) {
      const result = await uploadToCloudinary(req.file);
      req.file.path = result.secure_url;
      req.file.cloudinary_id = result.public_id;
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        await Promise.all(
          req.files.map(async (file) => {
            const result = await uploadToCloudinary(file);
            file.path = result.secure_url;
            file.cloudinary_id = result.public_id;
          })
        );
      } else {
        // For fields: { field1: [file1], field2: [file2] }
        const fieldNames = Object.keys(req.files);
        for (const field of fieldNames) {
          await Promise.all(
            req.files[field].map(async (file) => {
              const result = await uploadToCloudinary(file);
              file.path = result.secure_url;
              file.cloudinary_id = result.public_id;
            })
          );
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { cloudinary, upload, handleCloudinaryUpload };


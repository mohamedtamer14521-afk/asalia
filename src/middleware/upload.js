const multer = require('multer');

// Memory storage keeps the file in memory buffer so our StorageManager
// can stream/save it directly to S3 / Cloudinary / Persistent storage
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('INVALID_FILE_TYPE: Only JPG, PNG, and WebP images are allowed.'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1
  },
  fileFilter
});

const uploadProof = (req, res, next) => {
  upload.single('screenshot')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'Screenshot file size exceeds the 5MB limit.'
          }
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: err.message }
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FILE', message: err.message }
      });
    }
    next();
  });
};

const uploadImage = (fieldName = 'image') => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: 'حجم الصورة يتجاوز الحد الأقصى (5 ميجابايت).' }
          });
        }
        return res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message: err.message } });
      } else if (err) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_FILE', message: err.message } });
      }
      next();
    });
  };
};

module.exports = {
  upload,
  uploadProof,
  uploadImage
};

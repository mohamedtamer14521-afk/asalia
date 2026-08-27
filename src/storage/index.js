const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const os = require('os');
const isVercel = Boolean(process.env.VERCEL);
const UPLOADS_DIR = isVercel
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(process.cwd(), 'uploads');

try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  // Silent fallback for read-only serverless filesystem
}

class StorageManager {
  constructor() {
    this.provider = process.env.STORAGE_PROVIDER || 'local';
  }

  /**
   * Save an uploaded file buffer to persistent storage
   * @param {Object} file - Multer file object or { buffer, originalname, mimetype, size }
   * @returns {Promise<{ key: string, fileType: string, size: number, url?: string }>}
   */
  async saveFile(file) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const randomName = `${crypto.randomUUID()}${ext}`;
    const storageKey = `proofs/${Date.now()}_${randomName}`;

    if (this.provider === 's3') {
      return await this._saveToS3(storageKey, file);
    } else if (this.provider === 'cloudinary') {
      return await this._saveToCloudinary(storageKey, file);
    } else {
      // Local persistent storage fallback
      return await this._saveToLocal(storageKey, file);
    }
  }

  async _saveToLocal(key, file) {
    const mime = file.mimetype || 'image/png';
    const base64Data = file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64Data}`;

    try {
      const filePath = path.join(UPLOADS_DIR, path.basename(key));
      fs.writeFileSync(filePath, file.buffer);
    } catch (e) {
      // Ephemeral serverless fallback
    }

    return {
      key: path.basename(key),
      url: dataUrl,
      fileType: file.mimetype,
      size: file.size,
      provider: 'data-url'
    };
  }

  async _saveToS3(key, file) {
    // When S3 credentials are provided, AWS S3 / Cloudflare R2 / Supabase Storage is used
    try {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({
        region: process.env.STORAGE_REGION || 'auto',
        endpoint: process.env.STORAGE_ENDPOINT,
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY
        }
      });

      await client.send(new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype
      }));

      return {
        key,
        fileType: file.mimetype,
        size: file.size,
        provider: 's3'
      };
    } catch (err) {
      console.warn('[StorageManager] S3 upload failed, falling back to local:', err.message);
      return await this._saveToLocal(key, file);
    }
  }

  async _saveToCloudinary(key, file) {
    try {
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'asalia_proofs', public_id: key },
          (error, result) => {
            if (error) {
              console.warn('[StorageManager] Cloudinary upload error:', error);
              return this._saveToLocal(key, file).then(resolve).catch(reject);
            }
            resolve({
              key: result.public_id,
              fileType: file.mimetype,
              size: file.size,
              url: result.secure_url,
              provider: 'cloudinary'
            });
          }
        );
        uploadStream.end(file.buffer);
      });
    } catch (err) {
      console.warn('[StorageManager] Cloudinary failed, falling back to local:', err.message);
      return await this._saveToLocal(key, file);
    }
  }

  /**
   * Retrieve file stream or buffer for admin review
   * @param {string} key
   */
  async getFile(key) {
    const safeKey = path.basename(key);
    const localPath = path.join(UPLOADS_DIR, safeKey);
    if (fs.existsSync(localPath)) {
      return {
        stream: fs.createReadStream(localPath),
        exists: true
      };
    }
    return { exists: false };
  }
}

module.exports = new StorageManager();

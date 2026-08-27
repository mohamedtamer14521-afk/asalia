/**
 * Target link validators for various social platforms
 */

const LINK_PATTERNS = {
  instagram_profile: /^(https?:\/\/)?(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?(\?.*)?$/i,
  instagram_post: /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?(\?.*)?$/i,
  tiktok_profile: /^(https?:\/\/)?(www\.)?tiktok\.com\/@[a-zA-Z0-9._]+\/?(\?.*)?$/i,
  tiktok_video: /^(https?:\/\/)?((www|vm|vt)\.)?tiktok\.com\/.*$/i,
  youtube_channel: /^(https?:\/\/)?(www\.)?youtube\.com\/(channel\/|c\/|@|user\/)[a-zA-Z0-9_.-]+\/?(\?.*)?$/i,
  youtube_video: /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+(\&.*)?$/i,
  telegram_channel: /^(https?:\/\/)?(t\.me|telegram\.me)\/[a-zA-Z0-9_]+\/?$/i,
  facebook_page: /^(https?:\/\/)?(www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?(\?.*)?$/i,
  custom: /^https?:\/\/[^\s$.?#].[^\s]*$/i
};

/**
 * Validate a target link against the service's link_type
 * @param {string} link - URL to validate
 * @param {string} linkType - link_type configured for the service
 * @returns {{ isValid: boolean, message?: string }}
 */
function validateTargetLink(link, linkType) {
  if (!link || typeof link !== 'string' || link.trim().length === 0) {
    return { isValid: false, message: 'Target link cannot be empty.' };
  }

  const cleanLink = link.trim();

  // If link_type is custom, accept any valid web URL
  if (!linkType || linkType === 'custom') {
    const isUrl = /^https?:\/\//i.test(cleanLink) || cleanLink.includes('.');
    return {
      isValid: isUrl,
      message: isUrl ? null : 'Please provide a valid web link (e.g. https://...).'
    };
  }

  const pattern = LINK_PATTERNS[linkType];
  if (!pattern) {
    return { isValid: true };
  }

  const isValid = pattern.test(cleanLink);
  if (!isValid) {
    return {
      isValid: false,
      message: `Invalid link format for ${linkType.replace('_', ' ')}. Please ensure the URL matches the expected platform format.`
    };
  }

  return { isValid: true };
}

module.exports = {
  validateTargetLink,
  LINK_PATTERNS
};

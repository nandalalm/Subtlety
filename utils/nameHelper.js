import HTTP_STATUS from "../Constants/httpStatus.js";

const NAME_MAX_LENGTH = 50;
const NAME_PATTERN = /^[A-Za-z]+$/;

function buildNameValidationError(message) {
  throw { statusCode: HTTP_STATUS.BAD_REQUEST, message };
}

function normalizeSubmittedName(value, { fieldLabel, required = false, minLength = 0 } = {}) {
  const normalized = String(value || "").trim().slice(0, NAME_MAX_LENGTH);

  if (!normalized) {
    if (required) {
      buildNameValidationError(`${fieldLabel} is required.`);
    }
    return "";
  }

  if (/\s/.test(normalized)) {
    buildNameValidationError(`${fieldLabel} cannot contain spaces.`);
  }

  if (!NAME_PATTERN.test(normalized)) {
    buildNameValidationError(`${fieldLabel} must contain only letters.`);
  }

  if (normalized.length < minLength) {
    buildNameValidationError(`${fieldLabel} must be at least ${minLength} characters long.`);
  }

  return normalized;
}

function normalizeGoogleNamePart(value, fallback = "") {
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, NAME_MAX_LENGTH);

  return normalized || fallback;
}

export {
  NAME_MAX_LENGTH,
  normalizeSubmittedName,
  normalizeGoogleNamePart,
};

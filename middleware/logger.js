import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

import MESSAGES from "../Constants/messages.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, "../logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

const ERROR_LOG_PATH = path.join(LOG_DIR, "error.log");

export const logErrorToFile = (errorInfo) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} | ERROR | ${errorInfo}\n`;
  try {
    fs.appendFileSync(ERROR_LOG_PATH, logMessage);
  } catch (err) {
    console.error(MESSAGES.LOGGER.FILE_WRITE_ERROR, err);
  }
};

const logger = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      const logInfo = `${req.method} ${req.originalUrl} | ${res.statusCode}`;
      logErrorToFile(logInfo);
    }
  });
  next();
};

export const dbLogger = (message, isError = false) => {
  const timestamp = new Date().toISOString();
  if (isError) {
    const errorMsg = `DB ERROR | ${message}`;
    console.error(`${timestamp} | ${errorMsg}`);
    logErrorToFile(errorMsg);
  } else {
    // console.log(`${timestamp} | DB | ${message}`); // Removed terminal logging as per user request
  }
};

export default logger;

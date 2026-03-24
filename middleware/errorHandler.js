import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

import { logErrorToFile } from "./logger.js";

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  logErrorToFile(`${req.method} ${req.originalUrl}\n${err.stack}`);

  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = err.message || MESSAGES.GENERAL.INTERNAL_SERVER_ERROR;

  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(statusCode).json({ success: false, message });
  }

  res.status(statusCode).render(statusCode.toString(), { message });
};

export default errorHandler;

import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

import { logErrorToFile } from "./logger.js";

function wantsJson(req) {
  return req.xhr || req.accepts(["html", "json"]) === "json";
}

function getStatusCode(err) {
  const statusCode = err.statusCode || err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  if (statusCode < HTTP_STATUS.BAD_REQUEST || statusCode > 599) {
    return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  }
  return statusCode;
}

function getViewName(statusCode) {
  return statusCode === HTTP_STATUS.NOT_FOUND ? "404" : "500";
}

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = getStatusCode(err);
  const message = err.message || MESSAGES.GENERAL.INTERNAL_SERVER_ERROR;
  const stack = err.stack || message;

  logErrorToFile(`${req.method} ${req.originalUrl}\n${stack}`);

  if (wantsJson(req)) {
    return res.status(statusCode).json({ success: false, message });
  }

  res.status(statusCode).render(getViewName(statusCode), { message });
};

export default errorHandler;

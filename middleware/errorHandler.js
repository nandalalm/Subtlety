import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

import { logErrorToFile } from "./logger.js";

function wantsJson(req) {
  return (
    req.xhr ||
    req.is("application/json") ||
    req.get("accept") === "*/*" ||
    req.get("accept")?.includes("application/json") ||
    req.accepts(["html", "json"]) === "json"
  );
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

function buildJsonError(err, message) {
  const payload = { success: false, message, error: message };
  const fields = ["redirect", "errors", "cartState", "couponState", "availableStock", "logout"];

  if (Object.prototype.hasOwnProperty.call(err, "status") && typeof err.status !== "number") {
    payload.status = err.status;
  }

  if (err.statusFlag !== undefined) {
    payload.status = err.statusFlag;
  }

  fields.forEach((field) => {
    if (err[field] !== undefined) {
      payload[field] = err[field];
    }
  });

  return payload;
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
    return res.status(statusCode).json(buildJsonError(err, message));
  }

  if (err.redirect) {
    return res.redirect(err.redirect);
  }

  res.status(statusCode).render(getViewName(statusCode), { message });
};

export default errorHandler;

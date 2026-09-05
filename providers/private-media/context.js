"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const privateUploadContext = new AsyncLocalStorage();

const withPrivateUpload = (purpose, callback) =>
  privateUploadContext.run({ purpose }, callback);

const getPrivateUploadPurpose = () => privateUploadContext.getStore()?.purpose;

module.exports = { getPrivateUploadPurpose, withPrivateUpload };

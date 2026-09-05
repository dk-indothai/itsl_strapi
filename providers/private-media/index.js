"use strict";

const gcsProvider = require("@strapi-community/strapi-provider-upload-google-cloud-storage");
const { getPrivateUploadPurpose } = require("./context");
const { PROVIDER_NAME } = require("./validation");

const metadataFor = (file, visibility, purpose) => ({
  ...(file.provider_metadata || {}),
  visibility,
  ...(purpose ? { purpose } : {}),
  ...(Number.isInteger(file.sizeInBytes) ? { bytes: file.sizeInBytes } : {}),
});

const isStoredPrivate = (file) =>
  file?.provider_metadata?.visibility === "private";

const createDualProvider = (options, providerFactory = gcsProvider) => {
  if (!options?.public || !options?.private) {
    throw new Error(
      "Both public and private GCS provider options are required.",
    );
  }

  const publicProvider = providerFactory.init({
    ...options.public,
    publicFiles: true,
  });
  const privateProvider = providerFactory.init({
    ...options.private,
    publicFiles: false,
    expires: 5 * 60 * 1000,
  });

  const uploadWith = async (
    method,
    file,
    purpose = getPrivateUploadPurpose(),
  ) => {
    if (purpose) {
      file.path = "/" + (purpose === "resume" ? "resumes" : "complaints");
      await privateProvider[method](file);
      file.provider_metadata = metadataFor(file, "private", purpose);
      return;
    }

    await publicProvider[method](file);
    file.provider_metadata = metadataFor(file, "public");
  };

  const replaceWith = async (method, newFile, oldFile) => {
    if (!isStoredPrivate(oldFile)) {
      return uploadWith(method, newFile);
    }

    const purpose = oldFile.provider_metadata?.purpose;
    if (purpose !== "resume" && purpose !== "complaint") {
      throw new Error("Private media is missing a valid purpose.");
    }

    return uploadWith(method, newFile, purpose);
  };

  return {
    upload: (file) => uploadWith("upload", file),
    uploadStream: (file) => uploadWith("uploadStream", file),
    replace: (newFile, oldFile) => replaceWith("upload", newFile, oldFile),
    replaceStream: (newFile, oldFile) =>
      replaceWith("uploadStream", newFile, oldFile),
    delete: (file) =>
      isStoredPrivate(file)
        ? privateProvider.delete(file)
        : publicProvider.delete(file),
    isPrivate: () => true,
    getSignedUrl: (file) =>
      isStoredPrivate(file)
        ? privateProvider.getSignedUrl(file)
        : Promise.resolve({ url: file.url }),
  };
};

module.exports = {
  init: createDualProvider,
  createDualProvider,
  PROVIDER_NAME,
};

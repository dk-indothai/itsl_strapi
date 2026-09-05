export type PrivateUploadPurpose = "resume" | "complaint";

export function withPrivateUpload<T>(
  purpose: PrivateUploadPurpose,
  callback: () => T,
): T;

export function getPrivateUploadPurpose(): PrivateUploadPurpose | undefined;

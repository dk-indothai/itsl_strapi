interface UploadFile {
  url?: string;
  path?: string;
  sizeInBytes?: number;
  provider_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ProviderInstance {
  upload?(file: UploadFile): Promise<void>;
  uploadStream?(file: UploadFile): Promise<void>;
  replace?(newFile: UploadFile, oldFile: UploadFile): Promise<void>;
  replaceStream?(newFile: UploadFile, oldFile: UploadFile): Promise<void>;
  delete(file: UploadFile): Promise<void>;
  isPrivate(): boolean | Promise<boolean>;
  getSignedUrl(file: UploadFile): Promise<{ url: string }>;
}

export const PROVIDER_NAME: "@indothai/private-media";
export function init(options: Record<string, unknown>): ProviderInstance;
export function createDualProvider(
  options: Record<string, unknown>,
  providerFactory?: {
    init(options: Record<string, unknown>): ProviderInstance;
  },
): ProviderInstance;

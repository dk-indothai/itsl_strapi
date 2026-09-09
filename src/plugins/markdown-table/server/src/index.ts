import type { Core } from '@strapi/strapi';

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    strapi.customFields.register({
      name: 'markdown',
      plugin: 'markdown-table',
      type: 'text',
      inputSize: { default: 12, isResizable: true },
    });
  },
};

import type { ComponentType } from 'react';
import type { StrapiApp } from '@strapi/strapi/admin';
import { Icon } from './components/Icon';
import StrapiInput from './components/StrapiInput';
import { PLUGIN_ID, PLUGIN_NAME } from './pluginId';

export { MarkdownEditor } from './components/MarkdownEditor';
export { default as MarkdownInput } from './components/StrapiInput';

/** Opt in from src/admin/app.tsx to enhance existing richtext fields, keeping their schemas. */
export function registerMarkdownReplacement(app: Pick<StrapiApp, 'addFields'>) {
  // The registry erases field props; Strapi's renderer supplies InputProps at runtime.
  app.addFields({ type: 'richtext', Component: StrapiInput as unknown as ComponentType });
}

export default {
  register(app: StrapiApp) {
    app.registerPlugin({ id: PLUGIN_ID, name: PLUGIN_NAME });
    app.customFields.register({
      name: 'markdown',
      pluginId: PLUGIN_ID,
      type: 'text',
      icon: Icon,
      intlLabel: { id: `${PLUGIN_ID}.field.label`, defaultMessage: PLUGIN_NAME },
      intlDescription: {
        id: `${PLUGIN_ID}.field.description`,
        defaultMessage: 'Markdown editor with a visual table builder and preview.',
      },
      components: { Input: async () => ({ default: StrapiInput as unknown as ComponentType }) },
      options: {
        advanced: [
          {
            sectionTitle: null,
            items: [
              {
                name: 'required',
                type: 'checkbox',
                intlLabel: { id: 'attribute.options.required', defaultMessage: 'Required field' },
                description: {
                  id: 'attribute.options.required.description',
                  defaultMessage: 'You will not be able to create an entry if this field is empty',
                },
              },
              {
                name: 'private',
                type: 'checkbox',
                intlLabel: { id: 'attribute.options.private', defaultMessage: 'Private field' },
                description: {
                  id: 'attribute.options.private.description',
                  defaultMessage: 'This field will not show up in the API response',
                },
              },
            ],
          },
        ],
      },
    });
  },
  async registerTrads({ locales }: { locales: string[] }) {
    // Every message has an English default; host translations may override markdown-table.*.
    return locales.map((locale) => ({ data: {}, locale }));
  },
};

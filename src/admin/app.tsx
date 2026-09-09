import type { StrapiApp } from "@strapi/strapi/admin";
import { registerMarkdownReplacement } from "strapi-plugin-markdown-table/strapi-admin";

export default {
  register(app: StrapiApp) {
    registerMarkdownReplacement(app);
  },
};

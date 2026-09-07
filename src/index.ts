import type { Core } from "@strapi/strapi";
import { enforcePublicUploadPermissions } from "@indothai/private-media/permissions";

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await enforcePublicUploadPermissions(strapi);

    strapi.log.info("Seeding public role permissions");

    const publicRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({
        where: { type: "public" },
      });

    const actions = [
      "api::contact-form.contact-form.create",
      "api::software.software.find",
      "api::software.software.findOne",
      "api::software-category.software-category.find",
      "api::software-category.software-category.findOne",
      "api::candidate.candidate.create",
      "api::opening.opening.find",
      "api::opening.opening.findOne",
      "api::close-account-request.close-account-request.create",
      "api::complaint.complaint.create",
      "api::private-upload.private-upload.create",
      "api::overview.overview.find",
      "api::overview.overview.findOne",
      "api::shareholder-relation.shareholder-relation.find",
      "api::shareholder-relation.shareholder-relation.findOne",
      "api::shareholder-relation-category.shareholder-relation-category.find",
      "api::shareholder-relation-category.shareholder-relation-category.findOne",
      "api::financial-report.financial-report.find",
      "api::financial-report.financial-report.findOne",
      "api::disclosure-2015.disclosure-2015.find",
      "api::disclosure-2015.disclosure-2015.findOne",
      "api::client-relation.client-relation.find",
      "api::client-relation.client-relation.findOne",
      "api::blog.blog.find",
      "api::blog.blog.findOne",
    ];

    for (const action of actions) {
      const existing = await strapi
        .query("plugin::users-permissions.permission")
        .findOne({
          where: {
            role: publicRole.id,
            action,
          },
        });

      if (existing) {
        await strapi.query("plugin::users-permissions.permission").update({
          where: { id: existing.id },
          data: { enabled: true },
        });
      } else {
        await strapi.query("plugin::users-permissions.permission").create({
          data: {
            role: publicRole.id,
            action,
            enabled: true,
          },
        });
      }
    }
  },
};

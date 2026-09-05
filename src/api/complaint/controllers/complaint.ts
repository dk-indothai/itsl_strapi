/**
 * complaint controller
 */

import { factories } from "@strapi/strapi";
import { assertUnusedPrivateMedia } from "@indothai/private-media/validation";

export default factories.createCoreController(
  "api::complaint.complaint",
  ({ strapi }) => ({
    async create(ctx) {
      const attachment = ctx.request.body?.data?.attachment;
      if (attachment !== undefined && attachment !== null) {
        await assertUnusedPrivateMedia(strapi, attachment, "complaint");
      }
      return super.create(ctx);
    },
  }),
);

/**
 * candidate controller
 */

import { factories } from "@strapi/strapi";
import { assertUnusedPrivateMedia } from "@indothai/private-media/validation";

export default factories.createCoreController(
  "api::candidate.candidate",
  ({ strapi }) => ({
    async create(ctx) {
      await assertUnusedPrivateMedia(
        strapi,
        ctx.request.body?.data?.resume,
        "resume",
      );
      return super.create(ctx);
    },
  }),
);

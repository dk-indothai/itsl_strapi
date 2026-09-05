import type { Core } from "@strapi/strapi";

const routes: Core.RouterConfig = {
  type: "content-api",
  routes: [
    {
      method: "POST",
      path: "/private-upload",
      handler: "api::private-upload.private-upload.create",
    },
  ],
};

export default routes;

FROM node:24-bookworm-slim AS build

WORKDIR /opt/app

COPY package.json package-lock.json ./
# Local file dependencies and workspace metadata must exist before npm ci.
COPY providers/private-media ./providers/private-media
COPY src/plugins/markdown-table/package.json ./src/plugins/markdown-table/package.json
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN npx tsc --outDir /opt/app/compiled --declaration false --declarationMap false --sourceMap false --incremental false
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /opt/app

COPY --from=build /opt/app/package.json /opt/app/package-lock.json ./
COPY --from=build /opt/app/node_modules ./node_modules
COPY --from=build /opt/app/compiled/config ./config
COPY --from=build /opt/app/compiled/src ./src
# TypeScript excludes local plugins; preserve their build and workspace dependencies.
COPY --from=build /opt/app/src/plugins/markdown-table ./src/plugins/markdown-table
COPY --from=build /opt/app/dist/build ./build
COPY --from=build /opt/app/favicon.png ./favicon.png
COPY --from=build /opt/app/providers ./providers
COPY --from=build /opt/app/public ./public

ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["npm", "run", "start"]

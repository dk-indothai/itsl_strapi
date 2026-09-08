FROM node:22-bookworm-slim AS build

WORKDIR /opt/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npx tsc --outDir /opt/app/compiled --declaration false --declarationMap false --sourceMap false --incremental false
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /opt/app

COPY --from=build /opt/app/package.json /opt/app/package-lock.json ./
COPY --from=build /opt/app/node_modules ./node_modules
COPY --from=build /opt/app/compiled/config ./config
COPY --from=build /opt/app/compiled/src ./src
COPY --from=build /opt/app/dist/build ./build
COPY --from=build /opt/app/favicon.png ./favicon.png
COPY --from=build /opt/app/providers ./providers
COPY --from=build /opt/app/public ./public

ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["npm", "run", "start"]

# Build from the CAR_CRM repository root. This is a preparation artifact, not a deployed service.
FROM node:24-bookworm-slim
ENV NODE_ENV=production CAR_IG_REVIEW_HOST=0.0.0.0 CAR_IG_REVIEW_PORT=3096
WORKDIR /app
# Only pure validation/thread modules are included from the local review helper.
COPY --chown=node:node tools/instagram-review/webhook.cjs tools/instagram-review/thread.cjs ./tools/instagram-review/
COPY --chown=node:node tools/deployment/car-ig-review/server.cjs tools/deployment/car-ig-review/index.html tools/deployment/car-ig-review/review.js tools/deployment/car-ig-review/review.css ./tools/deployment/car-ig-review/
USER node
EXPOSE 3096
STOPSIGNAL SIGTERM
CMD ["node", "tools/deployment/car-ig-review/server.cjs"]

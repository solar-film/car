FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    CAR_LEAD_HOST=0.0.0.0 \
    CAR_LEAD_PORT=10000 \
    CAR_LEAD_DATABASE=/var/data/car-leads.sqlite \
    CAR_LEAD_ALLOWED_ORIGIN=https://solar-film.github.io

WORKDIR /app
RUN mkdir -p /var/data && chown node:node /var/data
COPY --chown=node:node \
    runtime/lead-data-server.cjs \
    runtime/lead-data-core.js \
    runtime/lead-data-facebook.cjs \
    runtime/lead-data-instagram.cjs \
    runtime/lead-data-line-sheet.cjs \
    runtime/lead-data-sheet-reader.cjs \
    runtime/lead-data-options.cjs \
    ./runtime/
USER node
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.CAR_LEAD_PORT||'10000')+'/api/lead-data/config',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(j=>{if(typeof j.local!=='boolean')process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "runtime/lead-data-server.cjs"]

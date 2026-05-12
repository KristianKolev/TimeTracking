FROM node:22-alpine

WORKDIR /app

COPY server.js /app/server.js
COPY index.html /app/public/index.html
COPY app.js /app/public/app.js
COPY styles.css /app/public/styles.css

ENV PORT=3000
ENV DATA_FILE=/data/state.json

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]

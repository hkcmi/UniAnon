FROM node:25-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY scripts ./scripts
COPY src ./src

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]

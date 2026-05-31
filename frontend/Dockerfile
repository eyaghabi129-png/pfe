FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public

EXPOSE 5173
CMD ["npm", "run", "dev"]

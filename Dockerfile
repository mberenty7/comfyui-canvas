FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p uploads
EXPOSE 3002
CMD ["node", "server.js"]

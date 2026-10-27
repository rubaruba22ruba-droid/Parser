# Drade Drop: бот + Mini App одним процессом. Node 22 (встроенный SQLite), без npm-зависимостей.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8080 DB_PATH=/data/data.db
VOLUME /data
EXPOSE 8080
CMD ["node", "--no-warnings", "index.js"]

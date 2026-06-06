FROM node:22-alpine

WORKDIR /app
COPY *.js ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]

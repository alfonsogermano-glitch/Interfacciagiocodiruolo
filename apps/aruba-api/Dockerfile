FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY src ./src

# Files may be checked out with restrictive permissions on the source host.
# The application and installed dependencies contain no secrets.
RUN chmod -R a+rX /app

USER node
EXPOSE 3000
CMD ["node", "src/index.mjs"]

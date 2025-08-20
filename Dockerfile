FROM alpine:latest

RUN mkdir -p /var/www/cli && chmod -R 0755 /var/www/cli

WORKDIR /var/www/cli

COPY ./cli.js /var/www/cli/cli.js

RUN apk add --no-cache \
    nodejs \
    npm

RUN npm install axios ws blessed

ENTRYPOINT ["node", "cli.js"]

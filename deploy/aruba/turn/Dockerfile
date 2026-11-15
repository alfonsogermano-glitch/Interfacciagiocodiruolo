# Coturn 4.18 Alpine sets CAP_NET_BIND_SERVICE=+ep on turnserver.
# That is unnecessary for our >=1024 listener ports and conflicts with
# the runtime's cap_drop ALL + no-new-privileges. Remove at build time.
FROM coturn/coturn:4.18.0-r0-alpine
USER root
RUN apk add --no-cache libcap \
    && setcap -r /usr/bin/turnserver \
    && apk del libcap
USER nobody:nogroup

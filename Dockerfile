# syntax=docker.io/docker/dockerfile-upstream:1.22.0
# check=error=true

# Container für eine Portal-App (JavaScript-Golden-Master)
# Verwaltete Datei: Änderungen nur über die Plattform (sonst PF-108)
#
# Aufruf:   docker build --tag hka/portal-app:0.1.0 .
#               ggf. --no-cache
#
#           Windows:   Get-Content Dockerfile | docker run --rm --interactive hadolint/hadolint:v2.14.0-debian
#           macOS:     cat Dockerfile | docker run --rm --interactive hadolint/hadolint:v2.14.0-debian
#
#           docker run --rm --read-only --cap-drop=ALL --tmpfs /tmp --publish 8080:8080 hka/portal-app:0.1.0
#           docker scout cves hka/portal-app:0.1.0

# https://docs.docker.com/build/building/multi-stage

# ARG: "build-time" Variable
# ENV: "build-time" und "runtime" Variable
ARG NODE_MAIN_VERSION=24

# ------------------------------------------------------------------------------
# S t a g e   b u i l d e r
# ------------------------------------------------------------------------------
FROM node:${NODE_MAIN_VERSION}-trixie-slim AS builder

WORKDIR /app

# Nur die Abhaengigkeiten aus package-lock.json, ohne Entwicklungswerkzeuge und ohne Installationsskripte.
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    ["npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"]

# ------------------------------------------------------------------------------
# S t a g e   f i n a l
# ------------------------------------------------------------------------------
FROM node:${NODE_MAIN_VERSION}-trixie-slim AS final

# Anzeige bei "docker inspect ..."
# https://specs.opencontainers.org/image-spec/annotations
LABEL org.opencontainers.image.title="hka-portal-app" \
    org.opencontainers.image.description="HKA Portal-App (JavaScript-Golden-Master) mit Basis-Image Trixie" \
    org.opencontainers.image.version="0.1.0"

# Eigener Benutzer mit fester UID statt "root"; /data ist der einzige beschreibbare Ordner neben /tmp
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir /data \
    && chown 10001:10001 /data

# "working directory" fuer die Docker-Kommandos RUN, ENTRYPOINT, CMD, COPY und ADD
WORKDIR /app

# node_modules, Portal-SDK, Quellcode und Manifest
COPY --from=builder /app/node_modules ./node_modules
COPY platform_sdk ./platform_sdk
COPY src ./src
COPY manifest.json package.json ./

USER 10001:10001

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

EXPOSE 8080

# Nur Node (fetch auf /healthz), kein curl im Image
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "platform_sdk/healthcheck.js"]

ENTRYPOINT ["node", "src/server.js"]

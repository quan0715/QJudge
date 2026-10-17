# Runtime only: the repository is mounted when the agent runs, so no QJudge code is
# baked in and an upgrade is picked up by checking out a new ref.
# The agent runs upgrades with this docker CLI and Compose, not the host's: keep its Compose
# major at or above the hosts' and bump this exact tag when the hosts upgrade Docker.
FROM docker:29.9.1-cli AS docker

FROM python:3.11-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/

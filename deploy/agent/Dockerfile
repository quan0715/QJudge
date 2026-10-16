# Runtime only: the repository is mounted when the agent runs, so no QJudge code is
# baked in and an upgrade is picked up by checking out a new ref.
FROM docker:27-cli AS docker

FROM python:3.11-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/

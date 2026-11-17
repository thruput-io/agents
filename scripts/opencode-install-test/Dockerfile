FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g --allow-scripts=@opencode/cli @opencode/cli@2.3.0 @agentplugins/cli@0.6.1 --no-audit --no-fund
USER node
ENV HOME=/home/node
ENV PATH=/home/node/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
RUN mkdir -p /home/node/.config/opencode /home/node/.npm-global /home/node/workspace \
  && npm config set prefix /home/node/.npm-global
COPY --chown=node:node . /home/node/source
CMD ["/home/node/source/scripts/opencode-install-test/run-inside-container.sh"]

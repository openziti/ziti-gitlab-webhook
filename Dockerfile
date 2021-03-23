# FROM node:lts-alpine3.12
FROM node:14.15.4-buster

LABEL maintainer="OpenZiti <openziti@netfoundry.io>"

# Install useful tools
RUN apt-get update
RUN apt-get install jq curl python2 

# Create directory for the Ziti GitLab webhook, and explicitly set the owner of that new directory to the node user
RUN mkdir /home/node/ziti-gitlab-webhook/ && chown -R node:node /home/node/ziti-gitlab-webhook
WORKDIR /home/node/ziti-gitlab-webhook

# Prepare for dependencies installation
COPY --chown=node:node package*.json ./

# Install the dependencies for the Ziti GitLab webhook according to package-lock.json (ci) without
# devDepdendencies (--production), then uninstall npm which isn't needed.
RUN npm ci --production \
 && npm cache clean --force --loglevel=error 

RUN chown -R node:node .

USER node

# Bring in the source of the Ziti GitLab webhook to the working folder
COPY --chown=node:node index.js .
COPY --chown=node:node ziti-webhook .

# Put the Ziti GitLab webhook on path 
ENV PATH=/home/node/ziti-gitlab-webhook:$PATH
# ENTRYPOINT ["/home/node/ziti-gitlab-webhook/zgw-docker-entrypoint"]


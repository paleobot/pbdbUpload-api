[![NSF-1550707](https://img.shields.io/badge/NSF-1948831-blue.svg)](https://nsf.gov/awardsearch/showAward?AWD_ID=1948831)

# Paleobiology Database Upload API Implementation

This repository is intended to act as the core repository for the Paleobiology Database "Upload" API version 1.0 and greater. The *development* (closed beta) version of the API can be found on the University of Arizona [test server](https://testpaleobiodb.colo-prod-aws.arizona.edu/pbdbupload/api/v1/help). The *staging* version (open beta) of the API can be found on the University of Wisconsin's [development server](https://dev.paleobiodb.org/pbdbupload/api/v1/help). There is no *production* version of the API at this time.

## Contribution

This API is currently in the Alpha phase of development and is not open for community development. A release candidate is expected to be published April 1, 2025. Once published, ownership of this repository will transfer into the stewardship of the Paleobiology Database organization and the API codebase will made open for community contribution. All contributors are expected to follow the [code of conduct](./code_of_conduct.md).  Contributors should fork this project and make a pull request indicating the nature of the changes and the intended utility.  Further information for this workflow can be found on the GitHub [Pull Request Tutorial webpage](https://help.github.com/articles/about-pull-requests/).

## Description
This codebase is generated using `node.js`. It was further boot-strapped with the `Fastify-CLI` framework, a JSON schema-based approach to API construction. The API attempts follow [REST](https://restfulapi.net/) principles wherever possible, but certain compromises have been made to maintain a similar user-experience with the preceding [CGI](https://www.ibm.com/docs/en/i/7.5?topic=programming-cgi-process)-[RPC](https://aws.amazon.com/compare/the-difference-between-rpc-and-rest/)-like system.

## To Install and Run the API
To start the server locally you must first download and install the dockerized version of the Paleobiology Database systems. This includes the following elements of the overall Paleobiology Database System: [Wing:](https://github.com/paleobiodb/Wing) a user-management system, [navigator:](https://github.com/paleobiodb/navigator) a map-based browser, [data_service:](https://github.com/paleobiodb/data_service) a data download only API, [pbdb_main:](https://github.com/paleobiodb/pbdb-main) code for the landing portal, [Classic:](https://github.com/paleobiodb/classic) the core application codebase, and the MariaDB database. While public GitHub repositories exist for most of these elements (excepting the MariaDB database), it is recommended to instead request access to a combined, dockerized installation from admin@paleobiodb.org.

Once you have installed a local copy of the other PBDB elements, you can clone this repository. Once the repository is cloned you must use the `npm` package installer to download the required packages.  The required packages are listed in `package.json`.  You can use the command `npm install` to install the packages locally.

Once the directory is set up and the packages have been installed, you must config for your environment. There is a file called env_template in the root dir that contains all the parameters you need to set. Copy that file to a file called .env and set them there.

Once configured, use `npm start` to start the server locally.  This will create a local server, serving data from the server:port specified in the .env file.

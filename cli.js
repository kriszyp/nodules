#!/usr/bin/env node

// just starts nodules
require("./lib/nodules").useLocal().runAsMain(process.argv[2]);
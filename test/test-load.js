require("../lib/nodules").ensure("http://github.com/kriszyp/nodules/raw/master/lib/nodules-utils/fs-promise.js", function(require){
        var validate = require("./fs-promise");
        require("sys").puts("loaded fs-promise: "+ validate);
});

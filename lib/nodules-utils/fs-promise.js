/**
* Node fs module that returns promises
*/

var fs = require("fs"),
  convertNodeAsyncFunction = require("./promise").convertNodeAsyncFunction;

// convert all the non-sync functions
for (var i in fs) {
  if (i.match(/Sync$/) || i.match(/watch/)) {
    exports[i] = fs[i];
  }
  else{
  	exports[i] = convertNodeAsyncFunction(fs[i]);
  }
}

var request = require("./nodules-utils/node-http-client").request,
	promiseModule = require("./nodules-utils/promise"),
	when = promiseModule.when,
	fs = require("./nodules-utils/fs-promise"),
	system = require("./nodules-utils/system"),
	Unzip = require("./nodules-utils/unzip").Unzip,
	zipInflate = require("./nodules-utils/inflate").zipInflate,
	print = system.print,
	paths = require.paths,
	defaultRequire = require,
	moduleExports = {
		promise: promiseModule,
		"fs-promise": fs,
		"nodules": exports,
		system: system
	},
	modules = {},
	factories = {},
	waitingOn = 0,
	inFlight = {},
	monitored = [],
	overlays = {},
	callbacks = [],
	packages = {},
	defaultPath = "",
	main = null,
	WorkerConstructor = typeof Worker !== "undefined" ? Worker : null;
	SharedWorkerConstructor = typeof SharedWorker !== "undefined" ? SharedWorker : null;
	defaultMap = {
		"http://github.com/([^/]+)/([^/]+)/raw/([^/]+)/(.*)": "zip:http://github.com/$1/$2/zipball/$3!/$4"
	};

function EnginePackage(engine){
	var enginePackage = this;
	this.useLocal= function(){
		try{
			var parsed = JSON.parse(fs.readFileSync("package.json"));
		}catch(e){
			e.message += " trying to parse local package.json";
			throw e;
		}
		return enginePackage.usePackage(parsed, "file://" + fs.realpathSync("."));
	};
	this.usePackage= function(packageData, path){
		processPackage(path, packageData, engine); 
		if(path){
			packageData.mappings.defaultPath = path + "/lib/";
		}
		for(var i in packageData){
			enginePackage[i] = packageData[i];
		}
		return enginePackage;
	};
	this.getModuleSource= function(id){
		print("cache path " + enginePackage.getCachePath(id));
		try{
			return fs.readFileSync(enginePackage.getCachePath(id));
		}catch(e){
			if(id.indexOf(":") === -1 && moduleExports[id.substring(0, id.length - 3)]){
				try{
					return fs.readFileSync(__dirname+ "/nodules-utils/" + id);
				}
				catch(e){}
			}
			
		}
	};
	this.getCachePath= function(id){
		if(id.substring(id.length - 3) == ".js"){
			id = id.substring(0, id.length - 3);
		}
		var uri = resolveUri("", id, enginePackage.mappings);
		if(uri.substring(0,7) == "file://"){
			return uri.substring(7);
		}
		return cachePath(uri);
	};	
}

packages[""] = exports;
exports.mappings = [];

exports.forEngine = function(engine){
	return new EnginePackage(engine);
}

exports.ensure = makeRequire({id:"", dependents:false}).ensure;
exports.runAsMain = function(uri){
	if(!uri || uri.indexOf(":") === -1){
		uri = "file://" + fs.realpathSync(uri || "lib/index.js");
	}
	main = modules[uri] = modules[uri] || new Module(uri); 
	return exports.ensure(uri, function(require){
		require(uri);
	});
};

EnginePackage.call(exports, typeof process !== "undefined" ? "node" : "narwhal");

function Module(uri){
	this.id = uri;
	this.dependents = {};
}

Module.prototype.supportsUri = true;

exports.baseFilePath = system.env.WEB_MODULES_PATH || "downloaded-modules";

function reloadable(onload){
	var onChange = function(){
		monitored.push(onChange);
		onload();
	}
	onChange();
}
function resolveUri(currentId, uri, mappings){
	if(uri.charAt(0) === '.'){
		var extension = currentId.match(/\.[\w]+$/);
		extension = extension ? extension[0] : "";
		currentId = currentId.substring(0, currentId.lastIndexOf('/') + 1);
		return [(currentId + uri).replace(/\/[^\/]*\/\.\.\//g,'/').replace(/\/\.\//g,'/')] + extension;
	}
	else if(uri.indexOf(":") > -1){
		return uri;
	}else{
		if(mappings){
			for(var i = 0; i < mappings.length; i++){
				var mapping = mappings[i];
				var from = mapping.from;
				if(from.test(uri)){
					if(uri.match(/multipart/)){
						print("replacing uri " + uri + " = " + uri.replace(from, mapping.to) + ("extension" in mapping ? mapping.extension : ".js"));
					}
					return uri.replace(from, mapping.to) + ("extension" in mapping ? mapping.extension : ".js");
				}
			}
			uri = mappings.defaultPath + uri + ".js";
		}
		return uri;
	}
}
function getPackage(uri){
	uri = uri.substring(0, uri.lastIndexOf('/lib/') + 1);
	return packages[uri] || packages[""];
}
function makeWorker(Constructor, currentId){
	return Constructor && function(script, name){
		var worker = Constructor("nodules-worker.js", name);
		var mappings = getPackage(currentId).mappings;
		worker.postMessage(resolveUri(currentId, script, mappings));
		return worker;
	}
}
var resolving = {};
function makeRequire(parentModule){
	var currentId = parentModule.id;
	var require = function(id){
		var uri = resolveUri(currentId, id, getPackage(currentId).mappings);
		parentModule.dependents[uri] = true;
		if(moduleExports[uri]){
			return moduleExports[uri];
		}
		if(factories[uri]){
			var exports = moduleExports[uri] = {};
			try{
				var module = modules[uri] = modules[uri] || new Module(uri);
				exports = factories[uri](makeRequire(module), exports, module, 
						makeWorker(WorkerConstructor, uri), makeWorker(SharedWorkerConstructor, uri)) 
							|| exports;
				var successful = true;
			}
			finally{
				if(!successful){
					delete moduleExports[uri];
				}
			}
			return exports;
		}
		if(uri.indexOf(":") === -1){
			id = uri;
			if(id.substring(id.length - 3) == ".js"){
				id = id.substring(0, id.length - 3);
			}
		}
		try{
			return moduleExports[id] || defaultRequire(id);
		}catch(e){
			throw new Error("Can not find module " + uri);
		}
	};
	require.main = main;
	require.define = function(moduleSet, dependencies){
		require.ensure(dependencies);
		for(var i in moduleSet){
			// TODO: Verify that id is an acceptably defined by the requested URL (shouldn't allow cross-domain definitions) 
			factories[i] = moduleSet[i];
		}
	};
	require.paths = paths;
	require.reloadable = reloadable;
	require.resource = function(uri){
		uri = resolveUri(currentId, uri, getPackage(currentId).mappings);
		return factories[uri];
	}
	require.ensure = function(uri, callback){
		var uri = resolveUri(currentId, uri, getPackage(currentId).mappings);
		var require = makeRequire({id:uri, dependents:false});
		var i = 0;
		if(factories[uri]){
			if(callback){
				callback(require);
			}
			return;
		}
		if(callback){
			callbacks.push(callback);
		}
		if(uri.indexOf(':') > 0 && !inFlight[uri]){
			waitingOn++;
			resolving[uri] = true;
			inFlight[uri] = true;
			var source = exports.load(uri, require);
			return when(source, function(source){
				try{
					if(source !== undefined){
						createFactory(uri, source);
						return exports;
					}
				}finally{
					decrementWaiting();
				}
			}, decrementWaiting);
			function decrementWaiting(){
				delete resolving[uri];
				waitingOn--;
				if(waitingOn === 0){
					for(var i in resolving){
						print("unresolved " + uri);
					}
					var calling = callbacks;
					callbacks = [];
					inFlight = {};
					calling.forEach(function(callback){
						callback(require);
					});
				}
			}
		}
	};
	return require;
}
function processPackage(packageUri, packageData, engine){
	engine = engine || exports.usingEngine;
	var mappings = packageData.mappings || {};
	var mappingsArray = packages[""].mappings;
	var defaultPath = mappingsArray.defaultPath;
	function addMappings(mappings){
		if(mappings){
			mappingsArray = mappingsArray.concat(Object.keys(mappings).map(function(key){
				var to = mappings[key];
				return {
					from: RegExp(key.charAt(0) == '^' ? key : '^' + key), // make sure it begins with ^
					to: resolveUri(packageUri, typeof to == "string" ? to : to.to)
				};
			}).sort(function(a, b){
				return a.from.toString().length < b.from.toString().length ? 1 : -1;
			}));
		}
	}
	if(packageData.overlay){
		Object.keys(packageData.overlay).forEach(function(condition){
			try{
				var matches = (engine == condition) || eval(condition);
			}catch(e){}
			if(matches){
				addMappings(packageData.overlay[condition].mappings);
			}
		});
	}
	addMappings(packageData.mappings);
	mappingsArray.defaultPath = defaultPath; 
	packageData.mappings = mappingsArray;
	return packageData;
}



exports.load = function(uri, require){
	var protocolLoader = exports.protocols[uri.substring(0, uri.indexOf(":"))];
	// do this so that we don't timeout on adding the error handler for the source
	if(!protocolLoader){
		throw new Error("Protocol " + uri.substring(0, uri.indexOf(":")) + " not implemented for accessing " + uri);
	}
	var source = protocolLoader(uri);
	return when(source, function(source){
		// check for source defined package URI
		var packageUri = source.match(/package root: (\w+:.*)/);
		if(packageUri){
			packageUri = packageUri[1];
		}
		else if(uri.substring(0,4) == "jar:"){
			// if it is an archive, the root should be the package URI
			var packageUri = uri.substring(0, uri.lastIndexOf('!') + 2);
		}
		else{
			// else try to base it on the path
			var packageUri = uri.substring(0, uri.lastIndexOf('/lib/') + 1);
		}
		var packageData = packages[packageUri];
		if(!packageData){
	//			idPart = uri;
	//		function tryNext(){
		//		idPart = idPart.substring(0, idPart.lastIndexOf('/') + 1);
			// don't watch json files or changes will create a new factory
			dontWatch[packageUri + "package.json"] = true;
			packageData = when(protocolLoader(packageUri + "package.json"), function(packageJson){
				if(!packageJson){
					return packages[packageUri] = processPackage(packageUri, {});
				}
				try{
					var parsed = JSON.parse(packageJson);
				}catch(e){
					e.message += " trying to parse " + packageUri + "package.json";
					throw e;
				}
				return packages[packageUri] = processPackage(packageUri, parsed);
			}, function(error){
				return packages[packageUri] = processPackage(packageUri, {});
			});
			if(!packages[packageUri]){
				packages[packageUri] = packageData;
			} 
		}
		return when(packageData, function(packageData){
			if(source){
				source.replace(/require\s*\(\s*['"]([^'"]*)['"]\s*\)/g, function(t, moduleId){
					if(require){
						require.ensure(moduleId);
					}
				});
				if(packageData.compiler){
					return when(require.ensure(packageData.compiler), function(){
						return require(packageData.compiler).compile(source);
					});
				}
			}
			return source;
		}, function(e){
			print(e.stack);
			throw e;
		});
	});
};

function createFactory(uri, source){
	try{
		factories[uri] = compile("(function(require, exports, module, Worker, SharedWorker){" + source + "\n;return exports;})", uri);
	}catch(e){
		factories[uri] = function(){
			throw new Error(e.message + " in " + uri);
		}
	}
}
exports.protocols = {
	http: cache(function(uri){
		return getUri(uri);
	}, true),
	jar: cache(function(uri){
		uri = uri.substring(4);
		var exclamationIndex = uri.indexOf("!");
		var target = uri.substring(exclamationIndex + 2);
		
		var targetContents;
		uri = uri.substring(0, exclamationIndex);
		return when(fs.stat(cachePath(uri)), function(){
			// archive has already been downloaded, but the file was not found
			return null;
		},
		function(){
			return when(getUri(uri),function(source){
				var unzip = new Unzip(source);
				unzip.readEntries();
				var rootPath = unzip.entries[0].fileName;
				unzip.entries.some(function(entry){
					if(target == entry.fileName){
						rootPath = "";
						return true;
					}
					if(entry.fileName.substring(0, rootPath.length) !== rootPath){
						rootPath = "";
					}
				});
				unzip.entries.forEach(function(entry){
					var fileName = entry.fileName.substring(rootPath.length); 
					var path = cachePath(uri + "!/" + fileName);
					if (entry.compressionMethod <= 1) {
						// Uncompressed
						var contents = entry.data; 
					} else if (entry.compressionMethod === 8) {
						// Deflated
						var contents = zipInflate(entry.data);
					}else{
						throw new Error("Unknown compression format");
					}
					ensurePath(path);
					if(path.charAt(path.length-1) != '/'){
						// its a file
						fs.writeFileSync(path, contents, "binary");
					}
					if(target == fileName){
						targetContents = contents;
					}
				});
				if(!targetContents){
					throw new Error("Target path " + target + " not found in archive " + uri);
				}
				return targetContents;
			});
		});
	}),
	file: function(uri){
		return readModuleFile(uri.substring(7), uri);
	},
	data: function(uri){
		return uri.substring(uri.indexOf(","));
	},
/*	"": function(id){
		// top level id
		var i = 0;
		function tryNext(){
			return when(readModuleFile(paths[i++] + '/' + id, id), null, i < paths.length && tryNext);
		}
		return tryNext();
	}*/
};

var requestedUris = {};
function getUri(uri){
	if(requestedUris[uri]){
		return requestedUris[uri];
	}
	print("Downloading " + uri);
	return requestedUris[uri] = request({url:uri, encoding:"binary"}).then(function(response){
		if(response.status == 302){
			return getUri(response.headers.location);
		}
		if(response.status < 300){
			return response.body.join("");
		}
		if(response.status == 404){
			return null;
		}
		throw new Error(response.status + response.body);
	});
}

function onFileChange(uri){
	// we delete all module entries and dependents to ensure proper referencing
	function removeDependents(module){
		delete moduleExports[module.id];
		var dependents = module.dependents; 
		module.dependents = {};
		for(var i in dependents){
			removeDependents(modules[i]); 
		}
	}
	removeDependents({id: uri});
	var calling = monitored;
	monitored = [];
	calling.forEach(function(callback){
		callback();
	});
}
function ensurePath(path){
	var index = path.lastIndexOf('/');
	if(index === -1){
		return;
	}
	var path = path.substring(0, index);
	try{
		fs.statSync(path);
	}catch(e){
		ensurePath(path);
		fs.mkdirSync(path, 0777);
	}
}
var watching = {};
var dontWatch = {};

function promiseReadFileSync(path){
	var deferred = promiseModule.defer();
	process.nextTick(function(){
		try{
			deferred.resolve(fs.readFileSync(path));
		}catch(e){
			e.message += " " + path;
			deferred.reject(e);
		}
	});
	return deferred.promise;
}
function readModuleFile(path, uri){
	return when(promiseReadFileSync(path), function(source){
		if(fs.watchFile && !watching[path] && !dontWatch[uri]){
			watching[path] = true;
			fs.watchFile(path, {persistent: false, interval: process.platform == "darwin" ? 300 : 0}, function(){
				delete factories[uri];
				exports.ensure(uri, function(){
					onFileChange(uri);
				});
			});
		}
		return source;
	});
}
function cachePath(uri){
	var path = uri;
	if(path.indexOf(exports.defaultUri) === 0){
		path = path.substring(exports.defaultUri.length);
	}
	return exports.baseFilePath + '/' + path.replace(/^\w*:(\w*:)?\/\//,'').replace(/!\/?/g,'/').replace(/:/g,'_'); // remove protocol and replace colons and add base file path
}
function cache(handler, writeBack){
	return function(uri){
		return when(readModuleFile(cachePath(uri), uri), function(source){
				if(source === "Not Found"){
					return null;
				}
				return source;
			}, function(error){
				print(error.message + " for " + cachePath(uri));
				var source = handler(uri);
				if(writeBack){
					when(source, function(source){
						var path =cachePath(uri);
						ensurePath(path);
						openFileThrottle(fs.writeFile)(path, source === null ? "Not Found" : null, "binary");
					});
				}
				return source;
			});
	};
};
var currentlyOpen = 0;
var queued = [];
function openFileThrottle(func){
	// don't want to use up all our file handles, so we throttle
	return function go(){
		if(currentlyOpen < 10){
			currentlyOpen++;
			return func.apply(this, arguments).then(function(value){
				decrement();
				return value;
			}, function(error){
				decrement();
				throw error;
			});
		}
		else{
			var args = arguments;
			var deferred = promiseModule.defer();
			queued.push(function(){
				deferred.resolve(go.apply(this, args));
			});
			return deferred.promise; 
		}
		function decrement(){
			currentlyOpen--;
			var next = queued.shift();
			if(next){
				next();
			}
		}
	};
}


// create compile function for different platforms
var compile = typeof process === "object" ? 
	process.compile :
	typeof Package === "object" ?
	function(source, name){
		return Packages.org.mozilla.javascript.Context.getCurrentContext().compileFunction(this, source, name, 1, null);
	} : eval;
	

if(require.main == module){
	exports.useLocal().runAsMain(system.args[2]);
}
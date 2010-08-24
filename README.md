Nodules is an asynchronous module loader for Node that provides URL/HTTP-based module
ids, module hot-reloading, and package based module mapping. Nodules 
implements the [CommonJS package.json mappings proposal](http://wiki.commonjs.org/wiki/Packages/Mappings) 
and automatically
analyzes modules references and downloads any dependencies on first access prior to
executing modules. Remotely downloaded modules are retained so they only need 
to be downloaded once. Nodules supports standard CommonJS modules, 
and CommonJS module transport format via require, require.ensure, [require.def](http://wiki.commonjs.org/wiki/Modules/Transport/C), and [require.define](http://wiki.commonjs.org/wiki/Modules/Transport/D).

To see Nodules in action right away, go into the "example" directory, and you can start
the example "package" with:

    node ../lib/nodules.js
    
The first time you run this, Nodules should automatically download the dependency, and
then start the application. You can test the module hot-reloading by making a change to 
sibling.js while it is running.

The most direct way to load a module with nodules is simply to load the module
from the command prompt:

    node /path/to/nodules.js http://somesite.com/my-module.js

The require provided by nodules is transitive, so all dependencies of my-module will also
be able to utilize full URLs. Nodules asynchronously downloads all the deep 
dependencies of a module prior to execution so that all requires can execute 
synchronously even though all modules are fetched asynchronously. The modules are 
all saved/cached locally so that future require calls (in future program executions)
can always run locally.

Naturally, it is easier to start nodules with a script, create a script with 
using the script from example/nodules as a template, and you can simply do: 
    
    nodules module-to-load 

Packages
========

For any type of real development, it is recommended that you use packages rather
than unorganized individual modules. Nodules provides an elegant mechanism for 
working with packages based on package.json mappings. A package is a directory/file
structure for a set of modules, module configuration, and other resources. An example
can be found in the nodules's "example" directory. If you run nodules from within
a package, it will automatically read the "package.json" from the current working directory
for module configuration and id mapping, use the "lib" as one of the default paths for looking modules,
and execute the "lib/index.js" file if it exists. The package.json's mappings can contain
mappings to URIs so that you don't have to use URIs directly in your require calls in
your modules. For example, your package.json could define this mapping to map the
foo namespace to the modules from a package archive available from somesite.com:

    package.json
    {
       "name":"my-project",
       "mappings": {
          "foo": "http://somesite.com/foo.zip"
       }
    }

We could then define our index.js file using that mapping:

    lib/index.js:
    var Something = require("foo/bar").Something; // The module from http://somesite.com/foo/lib/bar.js
    Something();

Now we can run our package by simply starting nodules from inside this directory
(with package.json):

    nodules

Mappings
--------

Nodules supports referening package zip file which is the recommended mechanism for referencing packages:
For example:

    "mappings": {
       "commonjs-utils": "http://github.com/kriszyp/commonjs-utils/zipball/master"
    }

When the target ends with a slash, the mapping will only match module ids in require statements 
where the mapping is the first term in a path, so this would match something of the form:

    require(""commonjs-utils/lazy-array");

You can also map directly to individual modules by specifying the full URL with an extension 
(and Nodules support the jar: scheme). For example:

    "lazy-array": "jar:http://github.com/kriszyp/commonjs-utils/zipball/master!/lib/lazy-array.js"

This will only match the exact module id of require("lazy-array") (not require("lazy-array/...")).

Module Reloading
================

Another critical aspect of productive development is module reloading so you don't 
have to constantly restart your VM. To use reloading, you can wrap your reloadable code
in a require.reloadable function. This function takes a callback
that is called whenever any loaded modules change (including when it is first called). 
For example:

	require.reloadable(function(){
		// Load the app and assign to "app" when started and for each reload
		app = require("./my-app.js");
	});
	// Don't re-execute http server initiation for each reload, should only load once 
	http.createServer(function(request, response){
		app(request, response);
	}).listen(80);

Nodules does intelligent dependency tracking so that when a file changes, the appropriate
modules are reloaded. All the modules that depend on the modified module are reloaded to
ensure correct references, but modules without depedency on the modified module are not
reloaded. This enabled optimal reloading performance while ensuring the proper references 
to objects are flushed for consistent behavior.

Module return values
====================

Nodules also supports modules that return a value or switch the exports. This 
very useful for situations where it is desirable for a module to provide a single 
function or constructor. One can create a module that returns a function like this:
    return function(){
      ...
    };

Or 
    exports = function(){
      ...
    };
    

     
Using Nodules Programmatically
==============================

You can still use nodules programmatically without having to start Node with 
nodules as the starting script. You can use Nodules's ensure function to 
asynchronously load an Nodules's entry module:

    require("nodules").ensure("http://somesite.com/foo", function(require){
      require("./foo");
    });


Where foo.js could have:

    var someModule = require("http://othersite.com/path/to/module");

For "normal" top-level ids, require will default to the system's require implementation, 
so modules can still do:

    var fs = require("fs");

Nodules Local Cache
===================

Nodules downloads any necessary dependencies and stores them locally. By 
default these files will be downloaded to a directory structure rooted in the current
working directory (under "downloaded-modules"). However, the location of the local directory of downloaded packages/modules 
can be defined with the NODULES_PATH environment variable. It is generally
recommended that you define the NODULES_PATH variable (to an absolute path)
so that the same set of cached/downloaded packages/modules can be reused from 
different working directories.

It is perfectly valid and reasonable to edit files from the locally
downloaded file set within this path. By default URLs are mapped to the file 
system by converting each part of the URL to a path, but this makes heavily 
nested paths. To make it easier to edit and work with 
your own packages, you can define a paths.json file in the NODULES_PATH 
directory that defines how URLs are mapped to the local file system. For example,
this makes a good paths.json for directing your git projects to your own
projects directory:

    {
      "(jar:)?http://github.com/my-name/([^\/]+)/zipball/[^\/]+!?" : "/projects/$2"
    }

(URLs that don't match will be saved using the default mapping mechanism.)

More package.json Configurations
================================
Engine Specific Overlay
-----------------------

CommonJS packages provides a means for creating engine-specific overlays to define
alternate configurations for other engines. For example, one could define an overlay in
package.json:
    {
       "overlay":{
         "node": {
            "file": "fs"
         }
       }
     }

Compiler
--------

We can also define a compiler to be used on sources prior to execution. This is 
more efficient than using a global extension matching like registerExtension since
it only applies to the package that defines the compiler rather than being global. In
your package.json you can define a compiler to use (this is how you would use CoffeeScript):

    {
       "compiler": {
             "module": "jar:http://github.com/jashkenas/coffee-script/zipball/master!/lib/coffee-script.js",
             "function": "compile"
       },
       "extension": ".coffee",
       ...
    }

The "module" property is required, and the "function" property is optional and defaults to "compile".

Proxy Settings
--------------

If your machine is behind a proxy, Nodules will need to go through the proxy for HTTP downloads. Nodules will 
read the "http_proxy" environmental variable to determine what proxy it needs to route requests through.

Nodules provided top level modules
----------------------------------

Nodules provides several top level modules for modules loaded with Nodules, including "promise" (promise library), 
"system" (based on CommonJS module), "fs-promise" (promise based fs module), and 
"nodules" (the nodules module itself).

Larger Example
--------------

You can download and run the [Persevere example wiki application](http://github.com/kriszyp/persevere-example-wiki/) with Nodules to see a more complex use of dependencies.

License
=======

Copyright (c) 2010, The Dojo Foundation All Rights Reserved.
Nodules is a sub-project of Persevere (www.persvr.org) and is thus available 
under either the terms of the modified BSD license or the Academic Free License 
version 2.1.  As a recipient of nodules, you may choose which license to receive 
this code under.

Dev Progress
============

Currently alpha level, issues:
URI redirection needs to properly change module ids
More unit tests
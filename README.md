Nodules is an asynchronous module loader for Node that provides URL/HTTP-based module
ids, module hot-reloading, and package based module mapping. Nodules 
implements the [CommonJS package.json mappings proposal](http://wiki.commonjs.org/wiki/Packages/Mappings) 
and automatically
analyzes modules references and downloads any dependencies on first access prior to
executing modules. Remotely downloaded modules are retained so they only need 
to be downloaded once. Nodules supports standard CommonJS modules, 
CommonJS module transport format via require and require.ensure.

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
foo namespace to the modules from a package available from somesite.com:

    package.json
    {
       "name"
       "mappings": {
          "foo/": "http://somesite.com/foo/lib/"
       }
    }

We could then define our index.js file using that mapping:

    lib/index.js:
    var Something = require("foo/bar").Something; // The module from http://somesite.com/foo/lib/bar.js
    Something();

Now we can run our package by simply starting nodules from inside this directory
(with package.json):

    nodules

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
==================================

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
========================

Nodules downloads any necessary dependencies and stores them locally. By 
default these files will be downloaded to a directory structure rooted in the current
working directory (under "downloaded-modules"). However, the location of the local directory of downloaded packages/modules 
can be defined with the NODULES_PATH environment variable. It is generally
recommended that you define the NODULES_PATH variable (to an absolute path)
so that the same set of cached/downloaded packages/modules can be reused from 
different working directories.

Note that it is perfectly valid and reasonable to edit and work on files from the locally
downloaded file set within this path.

More package.json Configurations
================================= 
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
-------

We can also define a compiler to be used on sources prior to execution. This is 
more efficient than using a global extension matching like registerExtension since
it only applies to the package that defines the compiler rather than being global. In
your package.json you can define a compiler to use:

    {
       "compilers": [
          {
             "module": "coffee-script-compiler",
             "function": "compile",
             "extension": "cs"
          }
       ]
    }

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
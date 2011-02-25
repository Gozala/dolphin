/* vim:ts=2:sts=2:sw=2:
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Irakli Gozalishvili <rfobic@gmail.com> (Original author)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

function Define(sandbox, fallbackId, fallbackDependencies) {
  /**
   * Implementation of CommonJS
   * [Modules/Transport/D](http://wiki.commonjs.org/wiki/Modules/Transport/D)
   * @param {Object} descriptors
   *    Hash of module top level module id's and relevant factories.
   * @param {String[]} dependencies
   *    Top-level module identifiers corresponding to the shallow dependencies
   *    of the given module factory
   * @param {Function} factory
   *
   */
  return function define(id, dependencies, factory) {
    var descriptors, descriptor
    // If last argument is `undefined` then only two arguments were passed and we
    // need to shift them.
    if (factory === undefined) {
      // If last two arguments are `undefined` then only factory was passed in
      // this case we use `fallbackId` as an `id` and `fallbackDependencies` as
      // a list of dependencies.
      if (dependencies === undefined) {
        factory = id
        dependencies = fallbackDependencies
      }
      // If two argument were passed we just shift arguments to the left and
      // using `fallbackId` as instead of `id`.
      else {
        factory = dependencies
        dependencies = id
      }
      id = fallbackId
    }

    Object.defineProperty(sandbox.descriptors, id, {
      value: {
        id: id,
        dependencies: dependencies || [],
        factory: factory
      },
      enumerable: true
    })
  }
}

var sandbox = { descriptors: {} }
var define = Define(sandbox)
var require = function require(id) {
  var descriptor, module
  dump('\n' + Object.keys(sandbox.descriptors))
  descriptor = sandbox.descriptors[id]
  if (!descriptor.module) {
    module = descriptor.module = { id: id, exports: {} }
    descriptor.factory.call({}, require, module.exports, module, undefined)
    Object.freeze(module.exports)
  }
  return descriptor.module.exports
}

define("dolphin/chrome", [], function(require, exports, module, undefined) {
  'use strict'

  const { classes: Cc, interfaces: Ci, utils: Cu, Constructor: CC } = Components
  exports.Cc = Cc
  exports.Ci = Ci
  exports.Cu = Cu
  exports.CC = CC
})

define("dolphin/sandbox", ["dolphin/process", "dolphin/chrome"], function(require, exports, module) {
  'use strict'

  var process = require("dolphin/process")
  const { Cc, Ci, Cu } = require("dolphin/chrome")

  /**
   * Sandbox is an object containing references to the loaded `modules`, `globals`
   * and a `path` for an additional libraries.
   */
  function Sandbox(options) {
    var sandbox
    if (this instanceof Sandbox) {
      options = options || {}
      sandbox = this
      sandbox.path = options.path || process.env['DOLPHIN_PATH'] || ''
      sandbox.modules = options.modules || {}
      sandbox.globals = options.globals || {}
      sandbox.packages = options.packages || {}
      sandbox.main = Main(sandbox)
      sandbox.require = Require(sandbox)
    } else {
      sandbox = new Sandbox(options);
    }
    return sandbox
  }
  exports.Sandbox = Sandbox

  /**
   * Creates a Module
   */
  function getModule(sandbox, id) {
    var modules = sandbox.modules
    return modules[id] || (modules[id] = {
      id: id,
      filename: getModulePath(sandbox, id)
    })
  }
  exports.getModule

  function getModulePath(sandbox, id) {
    return id.substr(-3) === '.js' ? id : id + '.js'
  }

  function isModuleIdRelative(id) {
    return '.' === id.charAt(0)
  }

  function getExtension(id) {
    var basename = id.split('/').pop()
      , index = basename.lastIndexOf('.')
    return 0 < index ? basename.substr(index) : ''
  }

  /**
   * Resolves relative module ID to an absolute id.
   * @param {String} id
   *    relative id to be resolved
   * @param {String} baseId
   *    absolute id of a requirer module
   * @return {String}
   *    absolute id
   */
  function resolveId(id, baseId) {
    var parts, part, root, base, extension
    // If given `id` is not relative or `baseId` is not provided we can't resolve.
    if (!baseId || !isModuleIdRelative(id)) return id
    extension = getExtension(baseId)
    parts = id.split('/')
    root = parts[0]
    base = baseId.split('/')
    if (base.length > 1) base.pop()
    while (part = parts.shift()) {
      if (part == '.') continue
      if (part == '..' && base.length) base.pop()
      else base.push(part)
    }
    return base.join('/') + extension
  }

  // Generator of global `require`.
  function Require(sandbox, requirerID) {
    function require(id) {
      var module, moduleSandbox, source
      // resolving relative id to an absolute id.
      id = resolveId(id, requirerID)
      // using module if it was already created, otherwise creating one
      // and registering into global module registry.
      module = getModule(sandbox, id)
      if (!module.exports) {
        module.filename = id //getModulePath(sandbox, id)
        source = getModuleSource(module.filename)
        moduleSandbox = Cu.Sandbox('module:' + module.filename)
        Object.keys(sandbox.globals).forEach(function (name) {
          moduleSandbox[name] = sandbox.globals[name]
        })
        moduleSandbox.require = Require(sandbox, id)
        moduleSandbox.module = module
        moduleSandbox.exports = module.exports = {}
        Cu.evalInSandbox(source, moduleSandbox, '1.8', 'file://' + module.filename, 1)
      }
      return Object.freeze(module.exports)
    }
    require.main = sandbox.main
    return require
  }

  function Main(sandbox) {
    return function main(id) {
      sandbox.main = getModule(sandbox, id)
      return sandbox.require(id)
    }
  }

  function getModuleSource(path) {
    let source = process.read(path)
    if ('#' === source.charAt(0)) source = '// ' + source
    // Wrapping module source into a self executable function in order to remove
    // access to the `Components` and to the sandbox.
    return source
  }
})

define("dolphin/process", ["dolphin/chrome"], function(require, exports, module) {
  'use strict'

  const { Cc, Ci, CC } = require("dolphin/chrome")
  const ENV = Cc['@mozilla.org/process/environment;1'].
              getService(Ci.nsIEnvironment);
  const dirService = Cc['@mozilla.org/file/directory_service;1'].
                     getService(Ci.nsIProperties)
  const LocalFile = CC('@mozilla.org/file/local;1', 'nsILocalFile',
                       'initWithPath')
  const FileInputStream = CC('@mozilla.org/network/file-input-stream;1',
                             'nsIFileInputStream', 'init')
  const ConverterStream = CC('@mozilla.org/intl/converter-input-stream;1',
                             'nsIConverterInputStream', 'init')

  function getEnv() {
    var env, path
    env = {}

    if ((path = ENV.get('DOLPHIN_PATH')))
      env['DOLPHIN_PATH'] = path

    return env
  }
  function getCommandLineArguments() {
    var args = ENV.get('DOLPHIN_CMD_ARGS')
    if (!args) args = []
    else args = args.split(' ')
    args.unshift('dolphin')
    return args
  }
  function readSTDIN() {
    var stdin = ENV.get('DOLPHIN_STDIN')
    return stdin
  }
  function getCurrentWorkingDirectory() {
    return dirService.get("CurWorkD", Ci.nsIFile)
  }
  function print(message) {
    process.stdout.write(message + '\n')
  }

  function File(path) {
    let file
    try {
      file = LocalFile(path)
    } catch(e) {
      file = new LocalFile(exports.cwd())
      path.split(/\\|\//).forEach(function(part) {
        if ('' !== part) file.append(part)
      })
    }
    return file
  }

  function read(path) {
    let file = File(path)
    let stream = ConverterStream(FileInputStream(file, -1, 0, 0), null, 0, 0)
    let data = {}
    let content = ''
    while (stream.readString(4096, data) != 0) content += data.value
    return content
  }

  exports.path = function path(path) {
    return File(path).path
  }
  exports.read = read
  exports.argv = getCommandLineArguments()
  exports.stdin = readSTDIN()
  exports.stdout = { write: dump }
  exports.cwd = function cwd() {
    return getCurrentWorkingDirectory().path
  }
  exports.env = getEnv()
})

function install(data, reason) {
  dump('install')
}
function uninstall(data, reason) {
  dump('uninstall')
}

function startup(data, reason) {
  var process = require("dolphin/process")
  var Sandbox = require("dolphin/sandbox").Sandbox
  var path = process.path(process.argv[1])

  Sandbox({ globals: { process: process } }).main(path)
}

function shutdown(data, reason) {
  dump('shutdown')
}

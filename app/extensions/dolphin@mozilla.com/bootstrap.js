const { classes: Cc, interfaces: Ci, utils: Cu, Constructor: CC } = Components
  ,   env = Cc['@mozilla.org/process/environment;1'].
            getService(Ci.nsIEnvironment)
  ,   principal = Cc['@mozilla.org/systemprincipal;1'].
                  createInstance(Ci.nsIPrincipal)
  ,   dirService = Cc['@mozilla.org/file/directory_service;1'].
                  getService(Ci.nsIProperties)
  ,   LocalFile = CC('@mozilla.org/file/local;1', 'nsILocalFile',
                     'initWithPath')
  ,   FileInputStream = CC('@mozilla.org/network/file-input-stream;1',
                           'nsIFileInputStream', 'init')
  ,   ConverterStream = CC('@mozilla.org/intl/converter-input-stream;1',
                           'nsIConverterInputStream', 'init')

function File(path) {
  let file
  try {
    file = LocalFile(path)
  } catch(e) {
    file = new LocalFile(process.cwd())
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

function getModuleSource(path) {
  let source = read(path)
  if ('#' === source.charAt(0)) source = '// ' + source
  return source
}

function getCommandLineArguments() {
  var args = env.get('DOLPHIN_CMD_ARGS')
  if (!args) args = []
  else args = args.split(' ')
  args.unshift('dolphin')
  return args
}
function readSTDIN() {
  var stdin = env.get('DOLPHIN_STDIN')
  return stdin
}
function getCurrentWorkingDirectory() {
  return dirService.get("CurWorkD", Ci.nsIFile)
}
function print(message) {
  process.stdout.write(message + '\n')
}

const process = {
  argv: getCommandLineArguments(),
  stdin: readSTDIN(),
  stdout: { write: dump },
  cwd: function cwd() {
    return getCurrentWorkingDirectory().path
  }
}

function install(data, reason) {
  print('install')
}
function uninstall(data, reason) {
  print('uninstall')
}

function startup(data, reason) {
  let sandbox = Cu.Sandbox(principal)
  sandbox.process = process
  let path = process.argv[1]
  let file = File(path)
  Cu.evalInSandbox(getModuleSource(path), sandbox, "1.8", 'file://' + file.path, 1)
}

function shutdown(data, reason) {
  print('shutdown')
}

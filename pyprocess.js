var spawn = require('child_process').spawn;
var path = require('path');
var util = require('util');
var events = require('events');

var pythonPath_default = 'C:/Python27/python.exe';
var runnerPyScript_default = './pyrunner.py';

var PyProcessor = module.exports.PyProcessor = function (dirPath, options) {
	events.EventEmitter.call(this);

	if (!dirPath) throw new Error('No directory path specified.');
	options = options || {};
	this.pythonPath = options.pythonPath || pythonPath_default;
	this.runnerPyScript = options.runnerPyScript || runnerPyScript_default;

	this._dirPath = dirPath;

	this.runnerScriptAbsPath = path.resolve(this.runnerPyScript);
	this.cwdAbsPath = path.resolve(dirPath);
	this.pythonShouldRun = false;

	this.sout = [];
	this.serr = [];
};

util.inherits(PyProcessor, events.EventEmitter);

PyProcessor.prototype.run = function () {
	var self = this;

	self.pythonShouldRun = true;

	function runPyProcess () {
		self.pyChildProc = spawn(self.pythonPath, [self.runnerScriptAbsPath], {
			cwd: self.cwdAbsPath,
			stdio: 'pipe'
		});

		self.pyChildProc.stdout.setEncoding('utf8');
		self.pyChildProc.stdout.on('data', function (data) {
			self.sout.push(data);
			if (self.sout.length > 10) self.sout.shift();
		});

		self.pyChildProc.stderr.setEncoding('utf8');
		self.pyChildProc.stderr.on('data', function (data) {
			self.serr.push(data);
			if (self.serr.length > 10) self.serr.shift();
		});

		self.pyChildProc.on('exit', function (code) {
			if (self.pythonShouldRun) {
				self.emit('crash' /*, crashdata */);
				runPyProcess();
			} else {
				self.emit('exit');
			}
		});

		self.pyChildProc.on('error', function (err) {
			self.emit('error', err);
		});
	}

	runPyProcess();
};

PyProcessor.prototype.stop = function () {
	var self = this;

	self.pythonShouldRun = false;

	self.pyChildProc.kill();
};

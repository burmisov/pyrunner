var pyprocess = require('./pyprocess');
var util = require('util');
var events = require('events');
var uuid = require('uuid');
var fsx = require('fs-extra');
var path = require('path');
var async = require('async');

var scriptName = 'script.py';

var PyRunner = module.exports.PyRunner = function (baseDirPath) {
	events.EventEmitter.call(this);

	if (!baseDirPath) throw new Error('No directory path specified.');

	this._baseDirPath = baseDirPath;
	this.prepared = false;
	this.busy = false;
};

util.inherits(PyRunner, events.EventEmitter);

PyRunner.prototype.prepare = function (callback) {
	var self = this;

	self.id = uuid.v4().slice(-6);
	self.dirPath = path.resolve(path.join(self._baseDirPath, self.id));

	fsx.mkdirs(self.dirPath, function (err) {
		if (err) return callback(err);

		self.pyproc = new pyprocess.PyProcessor(self.dirPath);

		self.pyproc.on('error', function (err) {
			//
		});

		self.pyproc.run();
		self.prepared = true;

		return callback();
	});
};

PyRunner.prototype.destroy = function (callback) {
	var self = this;

	self.pyproc.stop();
	delete self.pyproc;
	fsx.remove(self.dirPath, function (err) {
		if (err) return callback(err);
		return callback();
	});
};

PyRunner.prototype.runPy = function (script, callback) {
	var self = this;

	if (!self.prepared) return callback(new Error("Python runner is not yet prepare()d."));
	if (self.busy) return callback(new Error("Already running a task."));
	self.busy = true;
	
	fs.readdir(self.dirPath, function (err, files) {
		if (err) return callback(err);

		async.each(files,
			function (item, done) {
				fsx.remove(path.resolve(self.dirPath, item), done);
			},
			function (err) {
				if (err) return callback(err);

				fsx.writeFile(path.join(self.dirPath, scriptName), script, function (err) {
					if (err) return callback(err);

					self.waitProcessOutput(function (err, output) {
						if (err) return callback(err);
						self.busy = false;
						return callback(output);
					});
				});
			}
		);
	});
};

PyRunner.prototype.waitProcessOutput = function (callback) {
	var self = this;

	function checkOutput() {
		var outputExists = false;
		var outExists, excExists;
		async.parallel([
				function (done) {
					fsx.exists(path.join(self.dirPath, 'output.txt'), function (exists) {
						outputExists = outputExists || exists;
						outExists = exists;
						return done();
					});
				},
				function (done) {
					fsx.exists(path.join(self.dirPath, 'exception.txt'), function (exists) {
						outputExists = outputExists || exists;
						excExists = exists;
						return done();
					});
				}
			],
			function (err) {
				if (err) return callback(err);
				if (outputExists) {
					var output = {};
					output.sout = self.pyproc.sout;
					output.serr = self.pyproc.serr;

					async.parallel([
							function (done) {
								if (outExists) {
									fsx.readFile(path.join(self.dirPath, 'output.txt'), { encoding: 'utf8' }, function (err, data) {
										if (err) return done(err);
										output.output = data;
										return done();
									});
								} else {
									return done();
								}
							},
							function (done) {
								if (excExists) {
									fsx.readFile(path.join(self.dirPath, 'exception.txt'), { encoding: 'utf8' }, function (err, data) {
										if (err) return done(err);
										output.exception = data;
										return done();
									});
								} else {
									return done();
								}
							}
						], function (err) {
							if (err) return callback(err);
							return callback(null, output);
						}
					);
				} else {
					setTimeout(checkOutput, 1000);
				}
			}
		);
	}

	checkOutput();
};

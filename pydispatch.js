var pyrunner = require('./pyrunner');
var _ = require('underscore');
var async = require('async');

var TIMEOUTS = {
	maxIdleMs: 10*60*1000,
	freeRunnerCy: 50,
	newTaskCy: 50
};

var defaultOptions = {
	baseDir: './tmp/',
	maxRunners: 2
};

var PyDispatcher = module.exports.PyDispatcher = function (options) {
	this.options = _.defaults(options || {}, defaultOptions);

	this.runners = [];
	this.tasks = [];

	this.running = false;
};

PyDispatcher.prototype.checkAddRunners = function (callback) {
	var self = this;

	if (self.runners.length >= self.options.maxRunners) {
		return callback(false);
	} else {
		var runner = new pyrunner.PyRunner(self.options.baseDir);
		runner.prepare(function (err) {
			self.runners.push(runner);
			return callback(true);
		});
	}
};

PyDispatcher.prototype.checkIdleRunners = function (callback) {
	var self = this;

	var now = new Date();
	var idleRunners = _.filter(self.runners, function (r) { return (!r.busy && (now - r.lastRun > TIMEOUTS.maxIdleMs)); });

	async.each(idleRunners,
		function (r, done) {
			r.destroy(function (err) {
				if (err) throw err;

				var i = self.runners.indexOf(r);
				self.runners.splice(i, 1);

				done();
			});
		},
		function (err) {
			return callback(err);
		}
	);
};

PyDispatcher.prototype.waitGetFreeRunner = function (callback) {
	var self = this;

	function getFreeRunner (cb) {
		var freeRunnerFound = _.find(self.runners, function (r) { return !r.busy; });
		if (freeRunnerFound) {
			return callback(freeRunnerFound);
		} else {
			self.checkAddRunners(function () {
				setTimeout(function () {
					getFreeRunner(cb);
				}, TIMEOUTS.freeRunnerCy);
			});			
		}
	}

	getFreeRunner(callback);
};

PyDispatcher.prototype.start = function () {
	var self = this;
	self.running = true;

	function checkRunTask () {		
		if (self.tasks.length > 0) {
			var task = self.tasks.shift();
			self.waitGetFreeRunner(function (runner) {
				runner.runPy(task.script, function (err, result) {
					task.callback(err, result);					
				});
			});
		} else {
			self.checkIdleRunners(function () {});
		}

		if (self.running) {
			setTimeout(checkRunTask, TIMEOUTS.newTaskCy);
		}
	}

	checkRunTask();
};

PyDispatcher.prototype.stop = function (callback) {
	var self = this;
	self.running = false;

	function checkStop () {
		var busy = false;

		for (i = 0; i < self.runners.length; i++) {
			busy = busy || self.runners[i].busy;
		}

		if (busy) {
			setTimeout(checkStop, TIMEOUTS.freeRunnerCy);
		} else {
			return callback();
		}
	}
};

PyDispatcher.prototype.doTask = function (script, options, callback) {
	var task = {
		script: script,
		options: options,
		callback: callback
	};

	this.tasks.push(task);
};

// Диспетчер выполнения скриптов на Питоне
var debug = require('debug')('pydispatch');

var pyrunner = require('./pyrunner');
var _ = require('underscore');
var async = require('async');
var options = require('./options');

var TIMEOUTS = {
	maxIdleMs: 10*60*1000, // Сколько позволить существовать бездействующему запускателю
	freeRunnerCy: 50, // Интервал опроса на наличие свободного запускателя
	newTaskCy: 50 // Интервал опроса на наличие нового задания
};

var defaultOptions = {
	baseDir: './tmp/', // Базовая папка для запускателей
	maxRunners: options.maxRunners || 2 // Максимальное количество одновременных запускателей
};

// Класс PyDispather - диспетчер
var PyDispatcher = module.exports.PyDispatcher = function (options) {
	this.options = _.defaults(options || {}, defaultOptions);

	this.runners = []; // Запускатели
	this.tasks = []; // Очередь заданий

	this.running = false;
};

// Добавить еще один запускатель, если возможно
PyDispatcher.prototype.checkAddRunners = function (callback) {
	var self = this;

	// Только если максимальное количество запускателей не достигнуто
	if (self.runners.length >= self.options.maxRunners) {
		return callback(false);
	} else {
		// Создание нового запускателя
		var runner = new pyrunner.PyRunner(self.options.baseDir);
		runner.prepare(function (err) {
			self.runners.push(runner);
			return callback(true);
		});
	}
};

// Проверка на наличие слишком долго бездействующих запускателей и их уничтожение
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

// Ожидание свободного запускателя
PyDispatcher.prototype.waitGetFreeRunner = function (callback) {
	var self = this;

	function getFreeRunner (cb) {
		var freeRunnerFound = _.find(self.runners, function (r) { return !r.busy; });
		if (freeRunnerFound) {
			return callback(freeRunnerFound);
		} else {
			// Если свободных нет, делаем попытку добавить новый
			self.checkAddRunners(function () {
				setTimeout(function () {
					getFreeRunner(cb);
				}, TIMEOUTS.freeRunnerCy);
			});			
		}
	}

	getFreeRunner(callback);
};

// Запуск диспетчера
PyDispatcher.prototype.start = function () {
	var self = this;
	self.running = true;

	debug('Starting dispatcher, max runners: ' + self.options.maxRunners);

	// Проверка наличия и выполнение задания
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

// Остановка диспетчера
PyDispatcher.prototype.stop = function (callback) {
	var self = this;
	self.running = false;

	// Ожиджаем, пока все запускатели освободятся от заданий
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

// Приём задания в работу
PyDispatcher.prototype.doTask = function (script, options, callback) {
	var task = {
		script: script,
		options: options,
		callback: callback
	};

	this.tasks.push(task);
};

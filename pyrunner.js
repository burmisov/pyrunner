// "Запускатель" питон-скриптов

var pyprocess = require('./pyprocess');
var util = require('util');
var events = require('events');
var uuid = require('uuid');
var fsx = require('fs-extra');
var path = require('path');
var async = require('async');

// Как называть скрипт (должно совпадать с настройкой в pyrunner.py)
var scriptName = 'script.py';

var TIMEOUTS = {
	checkOutputCy: 100 // С какой частотой проверять наличие выдачи скрипта
};

// Класс PyRunner - собственно запускатель
// @param baseDirPath - в какой родительской папке работать (внутри будет создана еще одна)
var PyRunner = module.exports.PyRunner = function (baseDirPath) {
	events.EventEmitter.call(this); // Наследует от EventEmitter

	if (!baseDirPath) throw new Error('No directory path specified.');

	this._baseDirPath = baseDirPath;
	this.prepared = false;
	this.busy = false;
};

util.inherits(PyRunner, events.EventEmitter);

// Выполнение подготовки к работе
// callback (err)
PyRunner.prototype.prepare = function (callback) {
	if (!callback) throw new Error("Callback required.");

	var self = this;

	self.id = uuid.v4().slice(-6);
	self.dirPath = path.resolve(path.join(self._baseDirPath, self.id));

	// Создание себе рабочей папки
	fsx.mkdirs(self.dirPath, function (err) {
		if (err) return callback(err);

		// Создаение экземпляра PyProcessor в рабочей папке
		self.pyproc = new pyprocess.PyProcessor(self.dirPath);

		self.pyproc.on('error', function (err) {
			// todo
		});

		// Запуск PyProcessor
		self.pyproc.run();
		self.prepared = true;
		self.lastRun = new Date();

		return callback();
	});
};

// Уничтожение Запускателя
PyRunner.prototype.destroy = function (callback) {
	var self = this;

	// Остановка процессора и удаление папки
	self.pyproc.stop();
	delete self.pyproc;
	fsx.remove(self.dirPath, function (err) {
		if (err) return callback(err);
		return callback();
	});
};

// Запуск скрипта
// @param script - скрипт на Питоне, который нужно запустить
// callback (err, output)
PyRunner.prototype.runPy = function (script, callback) {
	var self = this;

	if (!self.prepared) return callback(new Error("Python runner is not yet prepare()d."));
	if (self.busy) return callback(new Error("Already running a task."));
	self.busy = true;
	
	// Удаление всех файлов из папки
	fsx.readdir(self.dirPath, function (err, files) {
		if (err) return callback(err);

		async.each(files,
			function (item, done) {
				fsx.remove(path.resolve(self.dirPath, item), done);
			},
			function (err) {
				if (err) return callback(err);

				// Создание файла со скриптом
				fsx.writeFile(path.join(self.dirPath, scriptName), script, function (err) {
					if (err) return callback(err);

					// Ождиание выдачи от скрипта
					self.waitProcessOutput(function (err, output) {
						if (err) return callback(err);
						self.busy = false;
						self.lastRun = new Date();
						return callback(null, output);
					});
				});
			}
		);
	});
};

// Функция ожидает выдачу от скрипта, обрабатывает её и запускает
// callback (err, output), где
// output = { output: выдача скрипта в консоль, exception: сведения об исключении }
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
					setTimeout(checkOutput, TIMEOUTS.checkOutputCy);
				}
			}
		);
	}

	checkOutput();
};

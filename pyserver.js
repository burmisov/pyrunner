var http = require('http');
var express = require('express');
var WebSocketServer = require('ws').Server;
var path = require('path');
var uuid = require('uuid');
var _ = require('underscore');
var connect = require('connect');

var PyDispatcher = require('./pydispatch').PyDispatcher;
var pydisp = new PyDispatcher();

var app = express();
var server = http.createServer(app);
var port = process.env.PORT || 3000;

server.listen(port);

app.use(connect.json());

app.get('/status', function (req, res) {
	res.json(200, {
		runnersCurrent: pydisp.runners.length,
		runnersBusy: (_.where(pydisp.runners, { busy: true })).length,
		runnersMax: pydisp.options.maxRunners
	});
});

app.post('/tasks', function (req, res) {
	// Добавить задание и создать websocket-точку
});

app.get('/tasks', function (req, res) {
	// Актуальный список заданий
});

app.get('/tasks/:taskId', function (req, res) {
	// Информация по конкретному заданию
});

app.use('*', function (req, res) {
	res.json(404, {
		result: 'Error',
		message: 'Resource not found.'
	});
});

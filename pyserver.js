var debug = require('debug')('pyserver');

var http = require('http');
var express = require('express');
var WebSocketServer = require('ws').Server;
var path = require('path');
var uuid = require('uuid');
var _ = require('underscore');
var connect = require('connect');
var cors = require('cors');
var options = require('./options');

var PyDispatcher = require('./pydispatch').PyDispatcher;
var pydisp = new PyDispatcher();

var app = express();
var server = http.createServer(app);
var port = options.port || process.env.PORT || 3000;

pydisp.start();
server.listen(port);
debug('listening on port ' + port);	

var tasks = {};

app.use(cors({ origin: true }));
app.use(connect.json());
app.use(connect.urlencoded());
app.use(express.static(path.join(__dirname, 'static')));

app.get('/', function (req, res) {
	res.redirect('ui.html');
});

app.get('/status', function (req, res) {
	res.json(200, {
		runnersCurrent: pydisp.runners.length,
		runnersBusy: (_.where(pydisp.runners, { busy: true })).length,
		runnersMax: pydisp.options.maxRunners
	});
});

app.post('/tasks', function (req, res) {
	var taskInput = req.body;
	console.log(taskInput);
	if (req.body && req.body.script && (typeof req.body.script === 'string')) {
		var task = taskInput;
		task.id = uuid.v4();
		task.wss = new WebSocketServer({ server: server, path: '/tasks/' + task.id });
		wireWssTaskEvents(task);
		task.createdAt = new Date();
		task.callback = function (err, output) {
			if (err) {
				task.result = 'Error';
				task.message = err.message;	
			} else {
				task.result = 'OK';
				task.output = output;
			}

			task.finishedAt = new Date();
			task.wss.broadcast(JSON.stringify(taskToJson(task)));
			task.wss.close();
		};

		pydisp.doTask(task.script, {}, task.callback);

		tasks[task.id] = task;

		res.json(200, {
			result: 'OK',
			taskId: task.id
		});
	} else {
		res.json(400, {
			result: 'Error',
			message: 'Task script required.'
		});
	}
});

app.get('/tasks', function (req, res) {
	res.json(_.map(tasks, taskToJson));
});

app.get('/tasks/:taskId', function (req, res) {
	if (tasks.hasOwnProperty(req.params.taskId)) {
		res.json(200, taskToJson(tasks[req.params.taskId]));
	} else {
		res.json(404, {
			result: 'Errror',
			message: 'Task <' + req.params.taskId + '> not found.'
		});
	}
});

app.delete('/tasks/:taskId', function (req, res) {
	if (tasks.hasOwnProperty(req.params.taskId)) {
		delete tasks[req.params.taskId];
		res.json(204, {
			result: 'OK'
		});
	} else {
		res.json(404, {
			result: 'Errror',
			message: 'Task <' + req.params.taskId + '> not found.'
		});
	}
});

app.use('*', function (req, res) {
	res.json(404, {
		result: 'Error',
		message: 'Resource not found.'
	});
});

function taskToJson(task) {
	return _.pick(
		task, 
		['id', 'result', 'createdAt', 'finishedAt', 'message', 'output']
	);
}

function wireWssTaskEvents(task) {
	task.wss.broadcast = function (msg) {
		for (var i = 0; i < this.clients.length; i++) {
			this.clients[i].send(msg);
		}
	};
}

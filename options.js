var optsPath = './options.yaml';					// Путь к "текущим" настройкам
var defaultOptsPath = './options.default.yaml';   // Путь к настройкам по умолчанию

var fs = require('fs');
var yaml = require('js-yaml');

var options;

// Если есть файл с "текущими" настройками, используем его,
// иначе загружаем настройки по умолчанию и сохраняем их как "текущие"
if (fs.existsSync(optsPath)) {
	options = yaml.safeLoad(fs.readFileSync(optsPath, 'utf8'));
} else {
	options = yaml.safeLoad(fs.readFileSync(defaultOptsPath, 'utf8'));
	fs.writeFileSync(optsPath, yaml.safeDump(options));
}

module.exports = options;

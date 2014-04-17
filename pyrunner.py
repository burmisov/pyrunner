import sys, os, time, json
from cStringIO import StringIO

input_script_path = './script.py'
output_data_path = './output.txt'
exception_data_path = './exception.txt'

def read_and_run_script():
	if os.path.isfile(output_data_path):
		os.remove(output_data_path)

	if os.path.isfile(exception_data_path):
		os.remove(exception_data_path)

	f = open(input_script_path)
	strar = f.readlines()
	f.close()
	os.remove(input_script_path)
	code = ''.join(strar)

	old_stdout = sys.stdout
	redirected_out = StringIO()
	sys.stdout = redirected_out

	sys_err_occurred = False

	try:
		exec(code)
	except Exception as e:
		sys_err_occurred = True
		sys_exception_text = str(e)
	tb = sys.exc_info()

	sys.stdout = old_stdout
	output = redirected_out.getvalue()

	print "Script output:"
	print "--------------"
	print output
	print "--------------"
	out_file = open(output_data_path, 'w')
	out_file.write(output)
	out_file.close()
	print "Output written to file."

	
	if sys_err_occurred:
		print "System exception occurred. Exception text:"
		print "=========================================="
		print sys_exception_text
		print "=========================================="
		exc_file = open(exception_data_path, 'w')
		exc_file.write(sys_exception_text)
		exc_file.close()
		print "Exception written to file."

# -------------------------------------------------------------

print "Watching current directory for script file..."

while 1:
	time.sleep(1)
	if os.path.isfile(input_script_path):
		print "Script found. Executing."
		read_and_run_script()
		print "Execution finished."
		print ""
		print "Watching current directory for script file..."
		print "\n\n"
		sys.stdout.flush()

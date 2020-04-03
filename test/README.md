# CLSP Plugin Tests

## Soak Test

### Running the test

Notes:
* you will need to clone or download this repository locally
* you can safely disregard the `ERROR: The process "chrome.exe" not found.` messages that may occur when running this script
* if you forget to use an administrator cmd, the script will prompt you for one

Steps:
1. Open the windows start menu, type `cmd`
1. Right-click on the `cmd` application, and choose `Run as Administrator`
1. Accept the UAC prompt
1. `cd` into the directory that contains these files, e.g. `cd C:\Users\skyline\Desktop\clsp-videojs-plugin\test\soak`
1. Run the script - `soak_monitor.bat [url]`
1. Follow the prompts to start the script.
    1. When you see the message `Starting Monitor` and an ascii spinner `[\]`, the monitoring script is running
1. Set up the wall/s as necessary
    1. 18 static HQ streams
1. Allow the test to run for 24 hours (or however long the soak test needs to be)
1. `ctrl+c` to initiate the termination logic
1. `n` followed by enter
    1. Do NOT terminate the running process.  it will terminate itself.  there is specific clean up logic that needs to run
1. Be sure to note any information you need, such as the location of the current monitoring output
1. Follow the prompts to close the command window

### Chrome remote debugging

See the "Chrome Remote Debugger Address" output when the script runs.  It will tell you the address and port to use for the remote debugger.  This should be run on a separate computer on the same subnet.

### Accessing the monitoring output

The monitoring output will be a csv file that gets created in the directory in which the `soak_monitor.bat` script is run.  Each new monitoring output csv file has a timestamp on it.  The output of the running script will tell you which file corresponds to the currently-running monitoring session.

### Data Visualization

Note that the jupyter notebook was deleted due to it's size.  It is still available in versions `0.16.0` and below.

Info:
* For our visualization solution we are using a Jupyter Notebook to parse the data and export it.
* Installation of Jupyter occurs through Miniconda.
* Visualiztion tools coming from pandas.
* Data visualization can be exported to HTML, PDF, Markdown, etc.
* New visualizations can be added to the report by adding new cells.

Steps:
1. Go to [Anacondas Website](https://www.anaconda.com/) and determine the most up to date, stable version of miniconda.
1. Locate the version of Miniconda that you need in their distribution page [here](https://repo.anaconda.com/miniconda/).
	* As of writing this the correct version to use is Miniconda3-4.5.11-Linux-x86_64.sh.
1. Navigate to the root of this project.
1. Run the following commands, interpolating the file name that you located in step two.
```
wget -c https://repo.continuum.io/miniconda/[file name here]
```
1. Before you run the installer run
```
md5sum [file name here]
```
and compare the resulting hash with the one from the distro page. If they are different then the file has been tampered with in some way, don't run it.
1. Run this command to start the installer.
```
bash [file name here]
```
1. This should drop you in an installer script. Correct responses as follows:
	1. Script will ask you to review the license, hit enter to review then type `Yes` to accept.
	1. Hit enter to accept default install location.
	1. Installer asks whether or not you would like to add the install location to PATH in your .bashrc. Enter `Yes`
	1. Installation will not take effect until you launch a new bash instance, either close and reopen your terminal or run `bash` to start up a new instance inside the first one.
1. Run the following commands to install Jupyter, matplotlib, and pandas.
```
conda install -c anaconda jupyter
conda install matplotlib
conda install pandas
```
1. From here you can run your reports with the following command:
```
jupyter nbconvert --to html [path to notebook file]
```
This will dump out an html file with the report in it.

Notes:
* To open up the notebook in order to work on it, first navigate to the directory, then run
```
jupyter notebook
```
this will start the notebook server, after that paste in the url the server provides and open it up in your browser, click on the notebook.

* If you decide to add new cells to the report you may need to install more python packages depending on what your doing. To do this you will most likely need to run
```
conda install [package name]
```
if you do this, be sure to add the new package to the install instructions.

## References

* [https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/typeperf#BKMK_EXAMPLES](https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/typeperf#BKMK_EXAMPLES)
* [http://steve-jansen.github.io/guides/windows-batch-scripting/part-7-functions.html](http://steve-jansen.github.io/guides/windows-batch-scripting/part-7-functions.html)
* [https://peter.sh/experiments/chromium-command-line-switches/](https://peter.sh/experiments/chromium-command-line-switches/)

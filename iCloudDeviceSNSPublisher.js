/**
 * Simple library to Publish updates for iOS devices to SNS. Useful for logging and other home integration efforts.
 * Code credit to Thomas Henley on parts for locating iOS devices (iPhone, iPod and iPad)
 */
var moment = require('moment');
var fs = require('fs');
var path = require('path');
var iCloudAccount = require("./iCloudAccount.js");

var AmazonSNSPublisher = require("./amazonSNSPublisher.js");
var amazonSNSPublisher;

var dateformat = "YYYY/MM/DD HH:mm:ss";
var configFileIncPath = path.join(__dirname + '/configuration.json');

var iCloudDayCheckFrequency;
var iCloudNightCheckFrequency;
var smartUpdatesOnly;
var iCloudAccounts;

var iCloudCheckIntervalID;

function main() {
	loadConfiguration(function() {
		
		postConfigurationSettings();

		// watch the configuration file for changes.  reload if anything changes
		fs.watchFile(configFileIncPath, function (event, filename) {
			console.log("** (" + getCurrentTime() + ") RELOADING CONFIGURATION");

			resetConfiguration();

			loadConfiguration(function() {
				postConfigurationSettings();
			});
		});
	});
}

function postConfigurationSettings() {
	var message;

	for (var recordNum in iCloudAccounts)
	{
		console.log("** (" + getCurrentTime() + ") About to initiate processing for iCloud account " + iCloudAccounts[recordNum].getLogin());

		iCloudAccounts[recordNum].processiCloudDevices(smartUpdatesOnly, function(iDevice) {
			var message;

			console.log("** (" + getCurrentTime() + ") Device " + iDevice.name + " has an update and is ready to be published...");

			message = buildiCloudSNSMessage(iDevice);

			console.log("** (" + getCurrentTime() + ") About to publish message for iDevice: " + iDevice.name + ", Message: " + JSON.stringify(message));

			amazonSNSPublisher.publish(message);
		});
	}	
}

function resetConfiguration() {
	iCloudAccounts = undefined;
	iCloudDayCheckFrequency = undefined;
	iCloudNightCheckFrequency = undefined;
	smartUpdatesOnly = undefined;
	amazonSNSPublisher = undefined;
}

function loadConfiguration(callback) {
	fs.readFile(configFileIncPath, 'utf8', function (err, data) {
		if (err) {
			console.log("** (" + getCurrentTime() + ") ERROR LOADING CONFIGURATION: " + err);
			return;
		}

		var configuration = JSON.parse(data);

		console.log("** (" + getCurrentTime() + ") CONFIGURATION: Adding AWS credentials");

		iCloudDayCheckFrequency = parseInt(configuration.iCloudDayCheckFrequency);
		iCloudNightCheckFrequency = parseInt(configuration.iCloudNightCheckFrequency);
		smartUpdatesOnly = configuration.SmartUpdatesOnly;

		console.log("** (" + getCurrentTime() + ") CONFIGURATION: Setting iCloud Daytime Refresh Frequency: " + iCloudDayCheckFrequency);
		console.log("** (" + getCurrentTime() + ") CONFIGURATION: Setting iCloud Nighttime Refresh Frequency: " + iCloudNightCheckFrequency);

		iCloudAccounts = new Array();

		for(var recordNum in configuration.iCloudAccounts) {
			var newAccount = new iCloudAccount(configuration.iCloudAccounts[recordNum].login, configuration.iCloudAccounts[recordNum].password);

			newAccount.setRefreshRates(iCloudDayCheckFrequency, iCloudNightCheckFrequency);

			console.log("** (" + getCurrentTime() + ") CONFIGURATION: Adding iCloud Account " + newAccount.getLogin());
			iCloudAccounts[iCloudAccounts.length] = newAccount;
		}

		amazonSNSPublisher = new AmazonSNSPublisher(configuration.AWSTopicARN);
		amazonSNSPublisher.configureAWSCredentials(configuration.AWS.defaultRegion, configuration.AWS.accessKeyId, configuration.AWS.secretAccessKey);

		if (callback != null) callback();
	});
}

function buildiCloudSNSMessage(iDevice) {
	var message = {
		'deviceID': iDevice.id,
		'deviceName': iDevice.name,
		'modelDisplayName': iDevice.modelDisplayName,
		'batteryLevel': iDevice.batteryLevel,
		'batteryStatus': iDevice.batteryStatus,
		'LocationTimestamp': iDevice.timeStamp,
		'latitude': iDevice.latitude,
		'longitude': iDevice.longitude,
		'isOldLocation': iDevice.isOld,
		'isInaccurateLocation': iDevice.isInaccurate
	}

	return message;
}

function getCurrentTime() {
	return (moment().format(dateformat));
}

main()

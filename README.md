iCloudDeviceSNSPublisher.js
===========================

Publishes the location and other useful information of your iDevices (iPhones and iPads) to Amazon SNS.  Useful if you want to use that data for other purposes, or to log it for archival.


Parameters
---
SmartUpdate: This will only publish a SNS message when the device location changes within a threshold of .0009 degrees (will make this configurable in the future) in either direction.  It will significanly cut down the number of SNS messages that are sent during times that your iDevice is stationary.

iCloudDayCheckFrequency: The frequency in which we will refresh your iCloud location for each iDevice during the day (defined as between 7am and 10pm, this will be made configurable in the future).  Recommend to keep this at 30 minutes or greater.

iCloudNightCheckFrequency: The frequency in which we will refresh your iCloud location for each iDevice during the evening (defined as between 10pm and 7am, this will be made configurable in the future).  Recommend to keep this at 60 minutes or greater.

FakePublish: Will not actually publish to SNS, good for testing purposes.
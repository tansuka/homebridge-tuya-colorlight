const tuya = require('homebridge-tuyapi-extended');
const convert = require('color-convert');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-tuya-colorlight", "TuyaColorLight", TuyaColorLight);
}

function TuyaColorLight(log, config) {
  // Setup this up.
  this.log = log;
  this.name = config.name;
  this.log.prefix = 'Tuya Color Light - ' + this.name;
  const debug = require('debug')('[Tuya Color Light - '  + this.name + ' ]  ');

  this.debug = config.debug || false;
  this.debugPrefix = config.debugPrefix || '~~~  '

  this.deviceEnabled = (typeof config.deviceEnabled === 'undefined') ? true : config.deviceEnabled;

  this.devId = config.devId;
  this.powerState = true;

  this.colorMode = 'white';
  this.brightness = 100; // percentage value use _convertValToPercentage functions below.

  this.color = {H: 130, S:100, L:50};
  this.color2 = {H: 0, S:100, L:50};

  this.hue = this.color.H;
  this.saturation = this.color.S;
  this.lightness = this.color.L;

  this.colorTemperature = 255;
  this.colorTempMin = 153;
  this.colorTempMax = 500;

  this.dps = {};

  // API timeout settings, tweak via config.
  this.apiMinTimeout = (typeof config.apiMinTimeout === undefined) ? 100 : config.apiMinTimeout;
  this.apiMaxTimeout = (typeof config.apiMaxTimeout  === undefined) ? 2000 : config.apiMaxTimeout;
  this.apiRetries = (typeof config.apiRetries === undefined) ? 1 : config.apiRetries;
  this.apiDebug = config.apiDebug || false;

  this.debugger(JSON.stringify(config));

  if(this.debug === true && this.apiDebug === true) {
    this.debugger('Tuya API Settings - Retries: ' + this.apiRetries + ' Debug: ' + this.apiDebug + ' Min Timeout: ' + this.apiMinTimeout + ' Max Timeout: ' + this.apiMaxTimeout);
  }

  // Setup Tuya Color Light
  if (config.ip != undefined && this.deviceEnabled === true) {

    this.debugger('Tuya Color Light ' + this.name + ' Ip is defined as ' + config.ip);

    this.tuyaColorLight = new tuya({type: 'color-lightbulb', ip: config.ip, id: config.devId, key: config.localKey, name: this.name, apiRetries: this.apiRetries, apiMinTimeout: this.apiMinTimeout, apiMaxTimeout: this.apiMaxTimeout, apiDebug: this.apiDebug, apiDebugPrefix: this.debugPrefix}, log);

  } else if(this.deviceEnabled === true) {

    this.debugger(this.debugPrefix + 'Tuya Color Light ' + this.name + ' IP is undefined, resolving Ids and this usually does not work, so set a static IP for your powerstrip and add it to the config...');

    this.tuyaColorLight = new tuya({type: 'color-lightbulb', id: config.devId, key: config.localKey, name: this.name, apiRetries: this.apiRetries, apiMinTimeout: this.apiMinTimeout, apiMaxTimeout: this.apiMaxTimeout, apiDebug: this.apiDebug, apiDebugPrefix: this.debugPrefix}, log);

    this.tuyaColorLight.resolveIds(); // This method sucks... it hangs, it doesn't resolve properly. Fix it.

  }

  this.services = this.getServices();

  // Pull an update from Tuya
  this._getLightStatus(function(error, result) {
    if(result) {
      this.services[1].setCharacteristic(Characteristic.On, result.powerState); // bool
      this.services[1].setCharacteristic(Characteristic.Hue, result.hue); // float
      this.services[1].setCharacteristic(Characteristic.Saturation, result.saturation); // float
      this.services[1].setCharacteristic(Characteristic.Brightness, result.brightness); // float
      this.services[1].setCharacteristic(Characteristic.ColorTemperature, result.colorTemperature); // int

      if(this.debug) {
        this.debugger('LIGHT ON STATUS IS: ' + result.powerState);
        this.debugger('Light Characteristics Service 1: ' + JSON.stringify(this.services, null, 10));
      } else {
        this.log.info('Updated light power status to: ' + result.powerState);
      }
      // this.services[4].value = result.brightness;
      return result;
    } else {
      this.services[1].setCharacteristic(Characteristic.On, false); // bool
      return {};
    }
    // Extend this some more to get the rest of the data collected to the proper state.
  }.bind(this));

  /* Device Function Points from Tuya lights... what a party to figure out.
  dps:
   { '1': true,
     '2': 'colour', // or 'white' if in white mode.
     '3': 25,  // brightness for white mode.
     '4': 0,   // temperature for white mode.
     '5': 'ff00150163ffff', // Primary color (ff0015) + Secondary Color (0163ff) + 2 bit for alpha channel (ff).
     '6': '00ff0000000000', // Unknown  timer?
     '7': 'ffff500100ff00', // Unknown  timer?
     '8': 'ffff8003ff000000ff000000ff000000000000000000', // Unknown scenes?
     '9': 'ffff5001ff0000', // Unknown timer
     '10': 'ffff0505ff000000ff00ffff00ff00ff0000ff000000'  // Unknown scenes?
    }
  */

  //debug(this.tuyaColorLight);
};


TuyaColorLight.prototype._getLightStatus = function(callback) {

  if(this.deviceEnabled === false) {
    this.log.warn('Device is disabled... Bailing out...');
    return callback('Disabled', null);
  }

  this.tuyaColorLight.get({schema: true}).then(status => {
    this.debugger('BEGIN TUYA COLOR LIGHT STATUS ' + this.debugPrefix);
    this.debugger('Getting Tuya Color Light device status');

    var result = {}

    result.powerState = status.dps['1'];

    if(status.dps['2'] !== undefined) {
      result.colorMode = status.dps['2']; // colour or white
    }

    if(status.dps['3'] !== undefined) {
      result.brightness = this._convertValToPercentage(status.dps['3']);
      result.lightness = Math.round(this.brightness / 2);
    }

    if(status.dps['4'] !== undefined) {
      result.colorTemperature = status.dps['4']; // TODO FIX
    }

    if(status.dps !== undefined) {

      if(status.dps['5'] !== undefined) {

        var converted = convert.hex.hsl(status.dps['5'].substring(0,6));
        var converted2 = convert.hex.hsl(status.dps['5'].substring(6,12));

        var alphaHex = status.dps['5'].substring(12,14);

        result.color = {};
        result.color.H = converted[0];
        result.color.S = converted[1];
        result.color.L = converted[2];

        // What is this? Some kind of mask? Yes...
        result.color2 = {};
        result.color2.H = converted2[0];
        result.color2.S = converted2[1];
        result.color2.L = converted2[2];

        result.alphaHex = alphaHex; // I believe this equates to brightness, or alpha in 2 hex chars: ff = 100%, 00 = 0%;
        result.hue = result.color.H;

        result.saturation = result.color.S;

        if(result.colorMode === 'colour') {
           // How do we set brightness though if it's in colour mode?
          result.brightness = result.color.L; // maybe * 2
        }

        var hexColor1 = convert.hsl.hex(result.color.H, result.color.S, result.color.L)
        var hexColor2 = convert.hsl.hex(result.color2.H, result.color2.S, result.color2.L);

      }

      if(!this.debug) {
        this.log.info('Received update for Tuya Color LED Light');
      } else {
        this.debugger("dps[1]: " + status.dps['1']);
        this.debugger("dps[2]: " + status.dps['2']);
        this.debugger("dps[3]: " + status.dps['3']);
        this.debugger("dps[4]: " + status.dps['4']);
        this.debugger("dps[5]: " + status.dps['5']);
        this.debugger("dps[6]: " + status.dps['6']);
        this.debugger("dps[7]: " + status.dps['7']);
        this.debugger("dps[8]: " + status.dps['8']);
        this.debugger("dps[9]: " + status.dps['9']);
        this.debugger("dps[10]: " + status.dps['10']);

        this.debugger('Factored Results ' + this.name + ' device properties...');
        this.debugger('TUYA Light [1] Power: ' + result.powerState);
        this.debugger('TUYA Light [2] Color Mode: ' + result.colorMode);
        this.debugger('TUYA Light [3] BRIGHTNESS: ' + result.brightness + '%');
        this.debugger('TUYA Light [4] TEMPERATURE: ' + result.colorTemperature);
        this.debugger('TUYA Light [5] (H)UE: ' + result.hue);
        this.debugger('TUYA Light [5] (S)ATURATION: ' + result.saturation + '%');
        this.debugger('TUYA Light [5] (L)ightness: ' + result.lightness + '%');
        this.debugger('TUYA Light DEVICE COLOR 1: ' + status.dps['5'].substring(0,6));
        this.debugger('TUYA Light Color 1 Hex to HSL: ' + converted);
        this.debugger('TUYA Light Color 1 HSL to HEX: ' + hexColor1);
        this.debugger('TUYA Light DEVICE COLOR 2: ' + status.dps['5'].substring(6,12));
        this.debugger('TUYA Light Color 2 Hex to HSL: ' + converted2);
        this.debugger('TUYA Light Color 2 HSL to HEX: ' + hexColor2);
        this.debugger('TUYA Light Color Alpha Hex Val: ' + status.dps['5'].substring(12,14));
        this.debugger('TUYA Light Color ALPHAHEX: ' + alphaHex);
      }

      // this.brightness = status.dps['3'] / 255 * 100;
    }

    this.debugger('END TUYA COLOR LIGHT STATUS ' + this.debugPrefix);

    return callback(null, result);

  }).catch(error => {
    this.debugger('BEGIN TUYA GET COLOR LIGHT STATUS ERROR ' + this.debugPrefix);
    this.debugger('Got Tuya Color Light device ERROR for ' + this.name);
    this.debugger(this.debugPrefix + error);
    this.debugger('END TUYA GET COLOR POWER STATUS ERROR ' + this.debugPrefix);
    if(!this.debug) {
      this.log.warn(this.debugPrefix + error.message);
    }
    return callback(error, null);
  });
}




TuyaColorLight.prototype.setToCurrentColor = function() {
  if(this.deviceEnabled === false) {
    this.log.warn('Device is disabled... Bailing out...');
    return callback('Disabled', null);
  }


  var color1 = this.color;
  var color2 = this.color2;

  var lightness = Math.round(this.brightness / 2);
  var apiBrightness = this._convertPercentageToVal(this.brightness);
  var alphaBrightness = this._getAlphaHex(this.brightness);

  var hexColorOriginal1 = convert.hsl.hex(color1.H, color1.S, color2.L);
  var rgbColorOriginal1 = convert.hsl.rgb(color1.H, color1.S, color2.L);

  var hexColorOriginal2 = convert.hsl.hex(0, 0, 50);
  var rgbColorOriginal2 = convert.hsl.rgb(0, 0, 50);

  var hexColor1 = convert.hsl.hex(color1.H, color1.S, lightness);
  var rgbColor1 = convert.hsl.rgb(color1.H, color1.S, lightness);

  var hexColor2 = convert.hsl.hex(0, 0, lightness);
  var rgbColor2 = convert.hsl.rgb(0, 0, lightness);

  // var ww = Math.round((this.brightness * 255) / 100);

  lightColor = (hexColor1  + hexColor2 + alphaBrightness).toLowerCase();

  var temperature = (this.colorMode === 'colour') ? 255 : this._convertColorTemperature(this.colorTemperature);

  var dpsTmp = {
                '1' : true,
                '2' : this.colorMode,
                '3' : apiBrightness,
                '4' : temperature,
                '5' : lightColor
                // '6' : hexColor + hexColor + 'ff'
              };

  this.tuyaColorLight.setDps({'id': this.devId, 'dps' : dpsTmp}).then(() => {
    if(this.debug) {
      this.debugger('BEGIN TUYA SET COLOR LIGHT COLOR ' + this.debugPrefix);

      this.debugger('HSL Settings - [(H)ue] ' + this.color.H);
      this.debugger('HSL Settings - [(S)aturation] ' + this.color.S);
      this.debugger('HSL Settings - [(L)ightness] ' + lightness);

      this.debugger('HEX COLOR 1 ORIGINAL: ' + hexColorOriginal1);
      this.debugger('HEX COLOR 1 at ' + this.brightness + '% Brightness: ' + hexColor1);

      this.debugger('Color 1 ORIGINAL Hex: ' + hexColorOriginal1 + ' at ' + this.brightness + '% Brightness: ' + hexColor1);
      this.debugger('Color 1 RGB ORIGINAL: ' + rgbColorOriginal1 + ' at ' + this.brightness + '% Brightness: ' + rgbColor1);
      this.debugger('Color 1 R ORIGINAL ' + rgbColorOriginal1[0] + ' R at ' + this.brightness + '% Brightness: ' + rgbColor1[0]);
      this.debugger('Color 1 G ORIGINAL ' + rgbColorOriginal1[1] + ' G at ' + this.brightness + '% Brightness: ' + rgbColor1[1]);
      this.debugger('Color 1 B ORIGINAL ' + rgbColorOriginal1[2] + ' B at ' + this.brightness + '% Brightness: ' + rgbColor1[2]);

      this.debugger('HEX COLOR 2 ORIGINAL: ' + hexColorOriginal2);
      this.debugger('HEX COLOR 2 at ' + this.brightness + '% Brightness: ' + hexColor2);

      this.debugger('Color 2 RGB ORIGINAL: ' + rgbColorOriginal2 + ' at ' + this.brightness + '% Brightness: ' + rgbColor2);
      this.debugger('Color 2 R ORIGINAL ' + rgbColorOriginal2[0] + ' R at ' + this.brightness + '% Brightness: ' + rgbColor2[0]);
      this.debugger('Color 2 G ORIGINAL ' + rgbColorOriginal2[1] + ' G at ' + this.brightness + '% Brightness: ' + rgbColor2[1]);
      this.debugger('Color 2 B ORIGINAL ' + rgbColorOriginal2[2] + ' B at ' + this.brightness + '% Brightness: ' + rgbColor2[2]);

      this.debugger('NEW HEX AlphaHex: ' + alphaBrightness);

      this.debugger('SETTING ' + this.name + " device to ");
      this.debugger('SETTING LIGHT MODE: ' + dpsTmp['2']);
      this.debugger('SETTING BRIGHTNESS: ' + this.brightness + '% or ' + dpsTmp['3'] + ' of 255');
      this.debugger('SETTING COLOR TEMPERATURE: ' + temperature + ' or ' + dpsTmp['4'] + ' of 255');

      this.debugger('SENT DPS VALUES: ');

      this.debugger("SENT dps[1]: " + dpsTmp['1']);
      this.debugger("SENT dps[2]: " + dpsTmp['2']);
      this.debugger("SENT dps[3]: " + dpsTmp['3']);
      this.debugger("SENT dps[4]: " + dpsTmp['4']);
      this.debugger("SENT dps[5]: " + dpsTmp['5']);
      // this.debugger("Sent dps[6]: " + dpsTmp['6']);
      // this.debugger("Sent dps[7]: " + dpsTmp['7']);
      // this.debugger("Sent dps[8]: " + dpsTmp['8']);
      // this.debugger("Sent dps[9]: " + dpsTmp['9']);
      // this.debugger("Sent dps[10]: " + dpsTmp['10']);
      this.debugger('END TUYA SET COLOR LIGHT COLOR ' + this.debugPrefix);
   }
    //return callback(null, 'ff5500');
  }).catch(error => {
    debug('BEGIN TUYA SET COLOR LIGHT COLOR ERROR ' + this.debugPrefix);
    this.debugger('Got Tuya device error for Setting ' + this.name + ' device to: ');
    this.debugger(dpsTmp.toString());
    this.debugger(error.message);
    this.debugger('END TUYA SET COLOR LIGHT COLOR ERROR ' + this.debugPrefix);
    //eturn callback(error, null);
  });
};

TuyaColorLight.prototype.setToWarmWhite = function() {
    var brightness = this.brightness;
    this.colorMode = 'white';
};


// MARK: - ON / OFF

TuyaColorLight.prototype._getOn = function(callback) {
  if(this.deviceEnabled === false) {
    this.log.warn('Device is disabled... Bailing out...');
    return callback('Disabled', null);
  }

  this.tuyaColorLight.get(["dps['1']"]).then(status => {
    this.debugger('TUYA GET COLOR LIGHT POWER for ' + this.name + ' dps: 1'  + this.debugPrefix);
    this.debugger('Returned Status: ' + status);
    this.debugger(this.debugPrefix +  ' END TUYA GET COLOR LIGHT POWER ' + this.debugPrefix);
    return callback(null, status);
  }).catch(error => {
    this.debugger('TUYA GET COLOR LIGHT POWER ERROR for ' + this.name + ' dps: 1');
    this.debugger(error.message);
    this.debugger('END TUYA GET COLOR LIGHT POWER ERROR ' + this.debugPrefix);
    return callback(error, null);
  });
}

TuyaColorLight.prototype._setOn = function(on, callback) {
  if(this.deviceEnabled === false) {
    this.log.warn('Device is disabled... Bailing out...');
    return callback('Disabled', null);
  }
  // TODO: Skip if the light is already on...
  this.tuyaColorLight.set({'id': this.devId, set: on, 'dps' : 1}).then(() => {
    this.debugger('TUYA SET COLOR LIGHT POWER ' + this.debugPrefix);
    this.debugger('Setting ' + this.name + ' dps: ' + '1' + ' device to: ' + on);
    this.debugger('END TUYA SET COLOR LIGHT POWER ' + this.debugPrefix);
    this.powerState = on;
    return callback(null, on);
  }).catch(error => {
    this.debugger('TUYA SET COLOR LIGHT POWER ERROR ' + this.debugPrefix);
    this.debugger('Got Tuya device error for ' + this.name + ' dps: 1');
    this.debugger(this.debugPrefix, error);
    this.debugger('END TUYA SET COLOR LIGHT POWER ERROR ' + this.debugPrefix);
    return callback(error, null);
  });
}

// MARK: - HUE

TuyaColorLight.prototype._getHue = function(callback) {
  var color = this.color;
  this.debugger('GET HUE: ' + color.H);
  callback(null, color.H);
};

TuyaColorLight.prototype._setHue = function(value, callback) {
  this.debugger('SET HUE: ' + value);
  if(value === 0 && this.color.S === 0) {
    this.colorMode = 'white';
    this.debugger('SET Color Mode: \'white\'');
  } else {
    this.colorMode = 'colour';
    this.debugger('SET Color Mode: \'colour\' -- dahhhhhh british spelling \'coulour\' really is annoying... why you gotta be special?');

  }
  this.color.H = value;
  this.setToCurrentColor();
  callback(null, value);
};

// MARK: - BRIGHTNESS
TuyaColorLight.prototype._getBrightness = function(callback) {
  var brightness = this.brightness;
  callback(null, brightness);
};

TuyaColorLight.prototype._setBrightness = function(value, callback) {
  this.brightness = value;
  var newValue = this._convertPercentageToVal(value);
  this.debugger(this.debugPrefix + " BRIGHTNESS from UI: " + value + ' Converted from 100 to 255 scale: ' +  newValue);
  this.setToCurrentColor();
  callback(null, value);
};

// MARK: - SATURATION
TuyaColorLight.prototype._getSaturation = function(callback) {
  var color = this.color;
  callback(null, color.S);
};

TuyaColorLight.prototype._setSaturation = function(value, callback) {
  this.colorMode = 'colour';
  this.saturation = value;
  this.color.S = value;
  this.debugger(this.debugPrefix + " SATURATION: " + value);
  // this.setToCurrentColor();
  callback(null, value);
};

// Mark: - TEMPERATURE
TuyaColorLight.prototype._getColorTemperature = function(callback) {
  var colorTemperature = this.colorTemperature;
  callback(null, colorTemperature);
};

TuyaColorLight.prototype._setColorTemperature = function(value, callback) {
  this.colorMode = 'white';
  this.colorTemperature = this._convertColorTemperature(value);
  this.debugger(this.debugPrefix + " COLOR TEMPERATURE: " + value);
  this.setToCurrentColor();
  callback(null, value);
};


TuyaColorLight.prototype.getServices = function() {

  // Setup the HAP services
  var informationService = new Service.AccessoryInformation();

  informationService
        .setCharacteristic(Characteristic.Manufacturer, 'Tuya - github@drumfreak')
        .setCharacteristic(Characteristic.Model, 'LED-controller')
        .setCharacteristic(Characteristic.SerialNumber, this.devId);


  var lightbulbService = new Service.Lightbulb(this.name);

  lightbulbService.getCharacteristic(Characteristic.On)
        .on('set', this._setOn.bind(this))
        .on('get', this._getOn.bind(this));

  lightbulbService.getCharacteristic(Characteristic.Hue)
        .on('get', this._getHue.bind(this))
        .on('set', this._setHue.bind(this));

  lightbulbService.getCharacteristic(Characteristic.Saturation)
        .on('get', this._getSaturation.bind(this))
        .on('set', this._setSaturation.bind(this));

  lightbulbService.getCharacteristic(Characteristic.Brightness)
        .on('set', this._setBrightness.bind(this))
        .on('get', this._getBrightness.bind(this));


  lightbulbService.getCharacteristic(Characteristic.ColorTemperature)
        .on('set', this._setColorTemperature.bind(this))
        .on('get', this._getColorTemperature.bind(this));

  // lightbulbService
  //       .getCharacteristic(Characteristic.ColorTemperature);


  // Note: default
  // maxValue: 500,
  // minValue: 140,
  // this.colorTemperatureService = this.lightbulbService.getCharacteristic(Characteristic.ColorTemperature)
  //       .on('get', this._getColorTemperature.bind(this))
  //       .on('set', this._setColorTemperature.bind(this))
  //       .setProps({
  //         minValue: this.colorTempMin,
  //         maxValue: this.colorTempMax
  //       });

  return  [informationService, lightbulbService];
};


TuyaColorLight.prototype._getAlphaHex = function(brightness) {
  // for (var i = 1; i >= 0; i -= 0.01) {
  var i = brightness  / 100;
  this.debugger('input brightness: ' + brightness + ' and i is ' + i);
  var alpha = Math.round(i * 255);
  var hex = (alpha + 0x10000).toString(16).substr(-2);
  var perc = Math.round(i * 100);

  this.debugger('alpha percent: ' + perc + '% hex: ' + hex + ' alpha: ' + alpha);
  return hex;
};

// MARK: - Helper Functions

TuyaColorLight.prototype._convertPercentageToVal = function(percentage) {
  var tmp = Math.round(255 * (percentage / 100));
  this.debugger('Converted ' + percentage + ' to: ' + tmp);
  return tmp;
};

TuyaColorLight.prototype._convertValToPercentage = function(val) {
  var tmp = Math.round((val / 255) * 100);
  this.debugger('Converted ' + val + ' to: ' + tmp);
  return tmp;
};

TuyaColorLight.prototype._convertColorTemperature = function(val) {
  var tmpRange = this.colorTempMax - this.colorTempMin;
  var tmpCalc = Math.round((val / this.colorTempMax) * 100);

  this.debugger('HK colorTemp Value: ' + val);
  this.debugger('HK colorTemp scale min : ' + this.colorTempMin);
  this.debugger('HK colorTemp scale max : ' + this.colorTempMax);
  this.debugger('HK colorTemp range (tmpRange): ' + tmpRange);
  this.debugger('HK colorTemp % tmpCalc: ' + tmpCalc);

  var tuyaColorTemp = this._convertPercentageToVal(tmpCalc);

  this.debugger('HK tuyaColorTemp: ' + tuyaColorTemp);

  return tuyaColorTemp;

};

TuyaColorLight.prototype._convertColorTemperatureToHK = function(val) {

  var tuyaColorTempPercent = this._convertValToPercentage(this.colorTemperature);
  var tmpRange = this.colorTempMax - this.colorTempMin;
  var tmpCalc = Math.round((tmpRange * (tuyaColorTempPercent / 100)) + this.colorTempMin);
  var hkValue = Math.round(tmpCalc);

  this.debugger('Tuya color Temperature : ' + val);
  this.debugger('Tuya color temp Percent of 255: ' + tuyaColorTempPercent + '%');

  this.debugger('HK colorTemp scale min : ' + this.colorTempMin);
  this.debugger('HK colorTemp scale max : ' + this.colorTempMax);

  this.debugger('HK Color Temp Range: ' + tmpRange);
  this.debugger('HK range %: ' + tuyaColorTempPercent);
  this.debugger('HK Value: ' + hkValue);

  return hkValue;

};


TuyaColorLight.prototype.debugger = function(args) {
  if(this.debug === true) {
    this.log.debug(this.debugPrefix, args);
  }
};

TuyaColorLight.prototype.identify = function (callback) {
  this.debugger(this.debugPrefix + _this.config.name + " was identified.");
  callback();
};

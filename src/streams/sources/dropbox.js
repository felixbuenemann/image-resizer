// Fetches an image from Dropbox via the v2 API

'use strict';

var _, stream, util, env, request;

_       = require('lodash');
stream  = require('stream');
util    = require('util');
env     = require('../../config/environment_vars');
request = require('request');

function contentLength(bufs){
  return bufs.reduce(function(sum, buf){
    return sum + buf.length;
  }, 0);
}

function Dropbox(image){
  /* jshint validthis:true */
  if (!(this instanceof Dropbox)){
    return new Dropbox(image);
  }
  stream.Readable.call(this, { objectMode : true });
  this.image = image;
  this.ended = false;
}

util.inherits(Dropbox, stream.Readable);

Dropbox.prototype._read = function(){
  var _this = this,
    url,
    outputFormat,
    imgStream,
    bufs = [];

  if ( this.ended ){ return; }

  // pass through if there is an error on the image object
  if (this.image.isError()){
    this.ended = true;
    this.push(this.image);
    return this.push(null);
  }

  if (/^[^.]+\.(id|rev)(\.|$)/.test(this.image.path)) {
    // a4ayc_80_OEAAAAAAAAAYa.id -> id:a4ayc_80_OEAAAAAAAAAYa
    // a1c10ce0dd78.rev -> rev:a1c10ce0dd78
    url = this.image.path.split('.').slice(0, 2).reverse().join(':');
    // fix setting of outputFormat due to invalid format id/rev
    // eg. a1c10ce0dd78.rev.png changes output format to png
    outputFormat = this.image.path.split('.').slice(2, 3)[0];
    if (_.indexOf(this.image.constructor.validOutputFormats, outputFormat) > -1) {
      this.image.outputFormat = outputFormat;
    }
  } else {
    // make relative path absolute
    url = '/' + this.image.path;
  }

  this.image.log.time('dropbox');

  imgStream = request.get({
    url: 'https://content.dropboxapi.com/2/files/download',
    headers: {
      'Dropbox-API-Arg': JSON.stringify({ path: url })
    },
    auth: {
      bearer: env.DROPBOX_ACCESS_TOKEN
    }
  });
  imgStream.on('data', function(d){ bufs.push(d); });
  imgStream.on('error', function(err){
    _this.image.error = new Error(err);
  });
  imgStream.on('response', function(response) {
    if (response.statusCode !== 200) {
      _this.image.error = new Error('Error ' + response.statusCode + ':');
    }
  });
  imgStream.on('end', function(){
    _this.image.log.timeEnd('dropbox');
    if(_this.image.isError()) {
      _this.image.error.message += Buffer.concat(bufs);
    } else {
      _this.image.contents = Buffer.concat(bufs);
      _this.image.originalContentLength = contentLength(bufs);
    }
    _this.ended = true;
    _this.push(_this.image);
    _this.push(null);
  });

};


module.exports = Dropbox;

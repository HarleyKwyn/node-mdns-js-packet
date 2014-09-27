var debug = require('debug')('mdns-packet:lib:dns:bufferconsumer');
var util = require('util');

var LABEL_POINTER = 0xc0;

var BufferConsumer = module.exports = function BufferConsumer(arg) {
  if (!(arg instanceof Buffer)) {
    debug('arg', arg);
    throw new Error('Expected instance of Buffer');
  }
  this._view = arg;
  this.length = this._view.length;
  debug('new consumer of %d bytes', this.length);
  this._offset = 0;
};

BufferConsumer.prototype.tell = function () {
  return this._offset;
};

BufferConsumer.prototype.seek = function (pos) {
  debug('trying to go to %s', pos);
  if (pos < 0) {
    throw new Error('Negative pos not allowed');
  }
  if (pos > this.length) {
    throw new Error(util.format('Cannot seek after EOF. %d > %d',
      pos, this.length));
  }
  this._offset = pos;
  return this;
};

BufferConsumer.prototype.slice = function (length) {
  if ((this._offset + length) > this.length) {
    debug('Buffer owerflow. Slice beyond buffer.', {
      offset:this._offset,
      length:length,
      bufferLength: this.length
    });
    debug('so far', this);
    throw new Error('Buffer overflow');
  }
  var v = this._view.slice(this._offset, this._offset + length);
  this._offset += length;
  return v;
};

BufferConsumer.prototype.isEOF = function () {
  return this._offset >= this.length;
};

BufferConsumer.prototype.byte = function () {
  this._offset += 1;
  return this._view.readUInt8(this._offset - 1);
};

BufferConsumer.prototype.short = function () {
  this._offset += 2;
  return this._view.readUInt16BE(this._offset - 2);
};

BufferConsumer.prototype.long = function () {
  this._offset += 4;
  return this._view.readUInt32BE(this._offset - 4);
};

BufferConsumer.prototype.string = function (encoding, length) {
  var end;
  var ret;

  if (length === undefined) {
    end = this._view.length;
  }
  else {
    end = this.tell() + length;
  }

  if (!encoding) {
    encoding = 'utf8';
  }
  ret = this._view.toString(encoding, this._offset, end);
  debug('got a %s character string:', length, ret);
  this.seek(end);
  return ret;
};


/**
 * Consumes a DNS name, which will either finish with a NULL byte or a suffix
 * reference (i.e., 0xc0 <ref>).
 */
BufferConsumer.prototype.name = function (join, endAt) {
  debug('.name(%s, %s)', join, endAt);
  if (typeof join === 'undefined') { join = true; }
  var parts = [];
  var ret;
  var len;
  var pos;
  var end;
  var comp = false;
  len = this.byte();
  debug('initial len', len);
  if (len === 0) {
    parts.push('');
  }
  while (len !== 0) {
    if ((len & LABEL_POINTER) === LABEL_POINTER) {
      debug('label');
      len -= LABEL_POINTER;
      len = len << 8;
      pos = len + this.byte();
      if (!comp) {
        end = this.tell();
      }
      this.seek(pos);
      len = this.byte();
      comp = true;
      continue;
    }
    debug('no label');

    // Otherwise, consume a string!
    var v = this.string('ascii', len);
    if (v.length > 0) {
      parts.push(v);
    }


    if (endAt && this.tell() >= endAt) {
      debug('leaving at', endAt);
      break;
    }
    len = this.byte();
    debug('got len', len);
  }
  if (!comp) {
    end = this.tell();
  }
  debug('ended');
  this.seek(end);
  if (join) {
    ret = parts.join('.');
  } else {
    ret = parts;
  }
  debug('ret', ret);
  return ret;
};


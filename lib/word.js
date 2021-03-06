var Buffer, Document, Promise, WordExtractor, filters, oleDoc, translations;

Buffer = require('buffer').Buffer;

oleDoc = require('./ole-doc').OleCompoundDoc;

Promise = require('bluebird');

filters = require('./filters');

translations = require('./translations');

Document = require('./document');

WordExtractor = (function() {
  var addText, addUnicodeText, documentStream, extractDocument, extractWordDocument, getPiece, streamBuffer, writeBookmarks, writePieces;

  function WordExtractor() {}

  streamBuffer = function(stream) {
    return new Promise(function(resolve, reject) {
      var chunks;
      chunks = [];
      stream.on('data', function(chunk) {
        return chunks.push(chunk);
      });
      stream.on('error', function(error) {
        return reject(error);
      });
      return stream.on('end', function() {
        return resolve(Buffer.concat(chunks));
      });
    });
  };

  extractDocument = function(filename) {
    return new Promise(function(resolve, reject) {
      var document;
      document = new oleDoc(filename);
      document.on('err', (function(_this) {
        return function(error) {
          return reject(error);
        };
      })(this));
      document.on('ready', (function(_this) {
        return function() {
          return resolve(document);
        };
      })(this));
      return document.read();
    });
  };

  WordExtractor.prototype.extract = function(filename) {
    return extractDocument(filename).then(function(document) {
      return documentStream(document, 'WordDocument').then(function(stream) {
        return streamBuffer(stream);
      }).then(function(buffer) {
        return extractWordDocument(document, buffer);
      });
    });
  };

  documentStream = function(document, stream) {
    return Promise.resolve(document.stream(stream));
  };

  writeBookmarks = function(buffer, tableBuffer, result) {
    var bookmarks, cData, cbExtra, cpEnd, cpStart, fcExtend, fcPlcfBkf, fcPlcfBkl, fcSttbfBkmk, index, lcbPlcfBkf, lcbPlcfBkl, lcbSttbfBkmk, length, offset, plcfBkf, plcfBkl, results, segment, sttbfBkmk;
    fcSttbfBkmk = buffer.readUInt32LE(0x0142);
    lcbSttbfBkmk = buffer.readUInt32LE(0x0146);
    fcPlcfBkf = buffer.readUInt32LE(0x014a);
    lcbPlcfBkf = buffer.readUInt32LE(0x014e);
    fcPlcfBkl = buffer.readUInt32LE(0x0152);
    lcbPlcfBkl = buffer.readUInt32LE(0x0156);
    if (lcbSttbfBkmk === 0) {
      return;
    }
    sttbfBkmk = tableBuffer.slice(fcSttbfBkmk, fcSttbfBkmk + lcbSttbfBkmk);
    plcfBkf = tableBuffer.slice(fcPlcfBkf, fcPlcfBkf + lcbPlcfBkf);
    plcfBkl = tableBuffer.slice(fcPlcfBkl, fcPlcfBkl + lcbPlcfBkl);
    fcExtend = sttbfBkmk.readUInt16LE(0);
    cData = sttbfBkmk.readUInt16LE(2);
    cbExtra = sttbfBkmk.readUInt16LE(4);
    if (fcExtend !== 0xffff) {
      throw new Error("Internal error: unexpected single-byte bookmark data");
    }
    offset = 6;
    index = 0;
    bookmarks = {};
    results = [];
    while (offset < lcbSttbfBkmk) {
      length = sttbfBkmk.readUInt16LE(offset);
      length = length * 2;
      segment = sttbfBkmk.slice(offset + 2, offset + 2 + length);
      cpStart = plcfBkf.readUInt32LE(index * 4);
      cpEnd = plcfBkl.readUInt32LE(index * 4);
      result.bookmarks[segment] = {
        start: cpStart,
        end: cpEnd
      };
      results.push(offset = offset + length + 2);
    }
    return results;
  };

  writePieces = function(buffer, tableBuffer, result) {
    var filePos, flag, i, lEnd, lStart, lastPosition, offset, piece, pieceTableSize, pieces, pos, ref, results, skip, start, totLength, unicode, x;
    pos = buffer.readUInt32LE(0x01a2);
    while (true) {
      flag = tableBuffer.readUInt8(pos);
      if (flag !== 1) {
        break;
      }
      pos = pos + 1;
      skip = tableBuffer.readUInt16LE(pos);
      pos = pos + 2 + skip;
    }
    flag = tableBuffer.readUInt8(pos);
    pos = pos + 1;
    if (flag !== 2) {
      throw new Error("Internal error: ccorrupted Word file");
    }
    pieceTableSize = tableBuffer.readUInt32LE(pos);
    pos = pos + 4;
    pieces = (pieceTableSize - 4) / 12;
    start = 0;
    lastPosition = 0;
    results = [];
    for (x = i = 0, ref = pieces - 1; i <= ref; x = i += 1) {
      offset = pos + ((pieces + 1) * 4) + (x * 8) + 2;
      filePos = tableBuffer.readUInt32LE(offset);
      unicode = false;
      if ((filePos & 0x40000000) === 0) {
        unicode = true;
      } else {
        filePos = filePos & ~0x40000000;
        filePos = Math.floor(filePos / 2);
      }
      lStart = tableBuffer.readUInt32LE(pos + (x * 4));
      lEnd = tableBuffer.readUInt32LE(pos + ((x + 1) * 4));
      totLength = lEnd - lStart;
      piece = {
        start: start,
        totLength: totLength,
        filePos: filePos,
        unicode: unicode
      };
      getPiece(buffer, piece);
      piece.length = piece.text.length;
      piece.position = lastPosition;
      piece.endPosition = lastPosition + piece.length;
      result.pieces.push(piece);
      start = start + (unicode ? Math.floor(totLength / 2) : totLength);
      results.push(lastPosition = lastPosition + piece.length);
    }
    return results;
  };

  extractWordDocument = function(document, buffer) {
    return new Promise(function(resolve, reject) {
      var flags, magic, table;
      magic = buffer.readUInt16LE(0);
      if (magic !== 0xa5ec) {
        console.log(buffer);
        return reject(new Error("This does not seem to be a Word document: Invalid magic number: " + magic.toString(16)));
      }
      flags = buffer.readUInt16LE(0xA);
      table = (flags & 0x0200) !== 0 ? "1Table" : "0Table";
      return documentStream(document, table).then(function(stream) {
        return streamBuffer(stream);
      }).then(function(tableBuffer) {
        var result;
        result = new Document();
        result.boundaries.fcMin = buffer.readUInt32LE(0x0018);
        result.boundaries.ccpText = buffer.readUInt32LE(0x004c);
        result.boundaries.ccpFtn = buffer.readUInt32LE(0x0050);
        result.boundaries.ccpHdd = buffer.readUInt32LE(0x0054);
        result.boundaries.ccpAtn = buffer.readUInt32LE(0x005c);
        writeBookmarks(buffer, tableBuffer, result);
        writePieces(buffer, tableBuffer, result);
        return resolve(result);
      })["catch"](function(error) {
        return reject(error);
      });
    });
  };

  getPiece = function(buffer, piece) {
    var pend, pfilePos, pstart, ptotLength, punicode, textEnd, textStart;
    pstart = piece.start;
    ptotLength = piece.totLength;
    pfilePos = piece.filePos;
    punicode = piece.unicode;
    pend = pstart + ptotLength;
    textStart = pfilePos;
    textEnd = textStart + (pend - pstart);
    if (punicode) {
      return piece.text = addUnicodeText(buffer, textStart, textEnd);
    } else {
      return piece.text = addText(buffer, textStart, textEnd);
    }
  };

  addText = function(buffer, textStart, textEnd) {
    var slice;
    slice = buffer.slice(textStart, textEnd);
    return slice.toString('binary');
  };

  addUnicodeText = function(buffer, textStart, textEnd) {
    var slice, string;
    slice = buffer.slice(textStart, 2 * textEnd - textStart);
    string = slice.toString('ucs2');
    return string;
  };

  return WordExtractor;

})();

module.exports = WordExtractor;

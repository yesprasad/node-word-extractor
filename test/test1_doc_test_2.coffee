chai = require('chai')
chai.use(require('chai-as-promised'))
should = chai.should()

WordExtractor = require('../lib/word')
Document = require('../lib/document')

describe 'test1.doc', () ->

  extractor = new WordExtractor()

  it 'should extract a document successfully', (done) ->
    extractor.extract 'test/data/test1.doc'
      .should.be.fulfilled
        .then (result) ->
          result.should.be.an.instanceof(Document)
          result.pieces.should.be.instanceof(Array).and.be.of.length(1)
          Object.keys(result.bookmarks).should.be.instanceof(Array).and.be.of.length(0)
          result.boundaries.should.contain.keys(['fcMin', 'ccpText', 'ccpFtn', 'ccpHdd', 'ccpAtn'])
        .should.notify(done)

  it 'should retrieve document text', (done) ->
    extractor.extract 'test/data/test1.doc'
      .then (document) ->
        body = document.getBody()
        body.should.match new RegExp('Welcome to BlogCFC')
        body.should.match new RegExp('http://lyla.maestropublishing.com/')
        body.should.match new RegExp('You must use the IDs.')
      .should.notify(done)

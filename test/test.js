"use strict";

var expect = require('expect.js');
var fs = require('fs');
var path = require('path');
var tabPlus = require('../tab-plus.js');

describe('parseRow', function(){
    var fixtures = [
        ['splited\\n line\\r\\n|field with pipe \\|', ['splited\n line\r\n', 'field with pipe |']],
        ['multi escaped pipes \\|a\\\\|b\\\\\\|c\\\\\\\\|d', ['multi escaped pipes |a\\', 'b\\|c\\\\', 'd']],
        ['|line with hex \\x7c pipe', ['', 'line with hex | pipe']],
        ['a\\sb', ['a b']],
        ['trailing space   |b', ['trailing space', 'b']],
        ['a\\s|b', ['a ', 'b']],
        ['a\\s   |b', ['a ', 'b']]
    ];
    fixtures.forEach(function(fixture){
        it('parses '+JSON.stringify(fixture[0]), function(){
            expect(tabPlus.parseRow(fixture[0])).to.eql(fixture[1]);
        });
    });
});

describe('escapeField / generateRow', function(){
    it('escapes backslash, pipe, cr, lf and tab', function(){
        expect(tabPlus.escapeField('a\\b|c\rd\ne\tf')).to.eql('a\\\\b\\x7Cc\\rd\\ne\\tf');
    });
    it('leaves plain text untouched', function(){
        expect(tabPlus.escapeField('hello world')).to.eql('hello world');
    });
    it('never generates an escaped pipe (\\|), only its hex code', function(){
        expect(tabPlus.escapeField('|')).to.eql('\\x7C');
        expect(tabPlus.escapeField('|')).not.to.contain('\\|');
    });
    it('escapes other control characters as hex', function(){
        expect(tabPlus.escapeField('a\x00b\x1fc')).to.eql('a\\x00b\\x1Fc');
    });
    it('joins fields with |', function(){
        expect(tabPlus.generateRow(['a', 'b', 'c'])).to.eql('a|b|c');
    });
    it('round-trips through parseRow', function(){
        var row = ['plain', 'with|pipe', 'with\\backslash', 'with\r\n\tcontrol', ''];
        expect(tabPlus.parseRow(tabPlus.generateRow(row))).to.eql(row);
    });
});

describe('parseTab', function(){
    it('parses a simple fixture', function(){
        var content = fs.readFileSync(path.join(__dirname, 'fixtures/simple.tab'), 'utf-8');
        var tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['simple_code', 'simple_name']);
        expect(tab.rows).to.eql([['1', 'one'], ['2', 'the second']]);
    });
    it('parses the users fixture and drops the trailing blank line', function(){
        var content = fs.readFileSync(path.join(__dirname, 'fixtures/users.tab'), 'utf-8');
        var tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['username', 'md5pass', 'active_until', 'locked_since', 'rol']);
        expect(tab.rows).to.eql([['bob', '6bdb73cceeff578319840176854246e5', '2099-01-01', '2099-01-01', 'admin']]);
    });
    it('ignores markdown-style separator and blank lines', function(){
        var content = 'a|b\r\n---|---\r\n\r\n1|2\r\n';
        var tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['a', 'b']);
        expect(tab.rows).to.eql([['1', '2']]);
    });
    it('strips a leading UTF8 BOM from the first header field', function(){
        var content = '﻿a|b\r\n1|2\r\n';
        var tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['a', 'b']);
    });
    it('returns empty fields and rows for empty content', function(){
        expect(tabPlus.parseTab('')).to.eql({fields: [], rows: []});
    });
});

describe('generateTab', function(){
    it('generates CRLF-separated lines with a trailing line ending', function(){
        var text = tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]});
        expect(text).to.eql('a|b\r\n1|2\r\n');
    });
    it('round-trips arbitrary data through parseTab', function(){
        var tab = {
            fields: ['id', 'text'],
            rows: [
                ['1', 'plain text'],
                ['2', 'with|pipe and \\backslash'],
                ['3', 'multi\r\nline\ttabbed'],
                ['4', '']
            ]
        };
        expect(tabPlus.parseTab(tabPlus.generateTab(tab))).to.eql(tab);
    });
    it('never emits an unescaped separator character inside a value', function(){
        var tab = {fields: ['f'], rows: [['line1\nline2\r\nline3|piped\\backslash']]};
        var text = tabPlus.generateTab(tab);
        var lines = text.split(/\r\n/).filter(function(line){ return line !== ''; });
        expect(lines.length).to.eql(2);
        lines.forEach(function(line){
            expect(tabPlus.parseRow(line).length).to.be.greaterThan(0);
        });
        expect(tabPlus.parseTab(text)).to.eql(tab);
    });
});

'use strict';

/** 端口占用关闭工具 - 核心逻辑单元测试（node:test） */

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');

test('validatePort: 合法端口', () => {
  assert.equal(core.validatePort('80'), 80);
  assert.equal(core.validatePort(' 8080 '), 8080);
  assert.equal(core.validatePort('1'), 1);
  assert.equal(core.validatePort('65535'), 65535);
  assert.equal(core.validatePort(443), 443);
});

test('validatePort: 非法端口', () => {
  assert.equal(core.validatePort('0'), null);
  assert.equal(core.validatePort('65536'), null);
  assert.equal(core.validatePort('abc'), null);
  assert.equal(core.validatePort(''), null);
  assert.equal(core.validatePort('12.5'), null);
  assert.equal(core.validatePort(null), null);
  assert.equal(core.validatePort(undefined), null);
});

test('extractPort', () => {
  assert.equal(core.extractPort('0.0.0.0:135'), '135');
  assert.equal(core.extractPort('[::]:135'), '135');
  assert.equal(core.extractPort('[::1]:8080'), '8080');
  assert.equal(core.extractPort('*:135'), '135');
  assert.equal(core.extractPort('0.0.0.0'), null);
  assert.equal(core.extractPort(''), null);
});

test('parseNetstatLine: TCP LISTENING', () => {
  const info = core.parseNetstatLine('TCP    0.0.0.0:135    0.0.0.0:0    LISTENING    1234');
  assert.equal(info.proto, 'TCP');
  assert.equal(info.localPort, '135');
  assert.equal(info.state, 'LISTENING');
  assert.equal(info.pid, '1234');
});

test('parseNetstatLine: TCP IPv6', () => {
  const info = core.parseNetstatLine('TCP    [::]:8080    [::]:0    LISTENING    456');
  assert.equal(info.localPort, '8080');
  assert.equal(info.pid, '456');
});

test('parseNetstatLine: UDP', () => {
  const info = core.parseNetstatLine('UDP    0.0.0.0:123    *:*    789');
  assert.equal(info.proto, 'UDP');
  assert.equal(info.localPort, '123');
  assert.equal(info.pid, '789');
  assert.equal(info.state, '');
});

test('parseNetstatLine: 垃圾行', () => {
  assert.equal(core.parseNetstatLine(''), null);
  assert.equal(core.parseNetstatLine('   '), null);
  assert.equal(core.parseNetstatLine('hello world'), null);
  assert.equal(core.parseNetstatLine('TCP    0.0.0.0'), null);
});

test('parseCsvLine', () => {
  const fields = core.parseCsvLine('"chrome.exe","1234","Console","1","N/A","50,000 K"');
  assert.equal(fields[0], 'chrome.exe');
  assert.equal(fields[1], '1234');
  assert.deepEqual(core.parseCsvLine('"a,b","c"'), ['a,b', 'c']);
});

test('parseTasklistNames', () => {
  const output = '"chrome.exe","1234","Console","1","N/A","50,000 K"\n"System","4","Services","0","N/A","100 K"\n';
  const names = core.parseTasklistNames(output);
  assert.equal(names['1234'], 'chrome.exe');
  assert.equal(names['4'], 'System');
});

test('collectPortProcesses: 过滤、去重、跳过 PID 0', () => {
  const output = [
    'TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    100',
    'TCP    127.0.0.1:8080  127.0.0.1:0  LISTENING    100',
    'TCP    0.0.0.0:9090    0.0.0.0:0    LISTENING    200',
    'UDP    0.0.0.0:8080    *:*          300',
    'TCP    0.0.0.0:8080    0.0.0.0:0    TIME_WAIT    0',
  ].join('\n');
  const { results, skipped } = core.collectPortProcesses(output, 8080, {
    '100': 'node.exe',
    '300': 'svchost.exe',
  });
  assert.deepEqual(results.map((r) => r.pid).sort(), ['100', '300']);
  assert.equal(results.find((r) => r.pid === '100').name, 'node.exe');
  assert.equal(results.find((r) => r.pid === '300').proto, 'UDP');
  assert.equal(skipped, 1);
});

test('collectPortProcesses: 无匹配', () => {
  const { results, skipped } = core.collectPortProcesses('', 9999, {});
  assert.deepEqual(results, []);
  assert.equal(skipped, 0);
});

test('buildKillArgs', () => {
  assert.deepEqual(core.buildKillArgs(9999), ['taskkill', '/PID', '9999', '/F']);
});

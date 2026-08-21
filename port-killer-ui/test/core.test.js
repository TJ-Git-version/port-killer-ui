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

test('parsePortRange: 合法范围', () => {
  assert.deepEqual(core.parsePortRange('8080-8090'), { start: 8080, end: 8090 });
  assert.deepEqual(core.parsePortRange(' 8000 - 8100 '), { start: 8000, end: 8100 });
  assert.deepEqual(core.parsePortRange('1-1000'), { start: 1, end: 1000 });
  assert.deepEqual(core.parsePortRange('80~90'), { start: 80, end: 90 });
});

test('parsePortRange: 非法范围', () => {
  assert.equal(core.parsePortRange('8080'), null);
  assert.equal(core.parsePortRange('9000-8000'), null);
  assert.equal(core.parsePortRange('0-100'), null);
  assert.equal(core.parsePortRange('100-65536'), null);
  assert.equal(core.parsePortRange('abc-def'), null);
  assert.equal(core.parsePortRange('8080-'), null);
  assert.equal(core.parsePortRange('-8090'), null);
  assert.equal(core.parsePortRange(''), null);
  assert.equal(core.parsePortRange(null), null);
  assert.equal(core.parsePortRange(undefined), null);
});

test('parsePortRange: 超过单次最大数量', () => {
  assert.equal(core.parsePortRange('1-65535'), null); // 65535 个 > MAX_RANGE_PORTS
  assert.equal(core.parsePortRange('5000-6000'), null); // 1001 个 > 1000
  assert.deepEqual(core.parsePortRange('5000-5999'), { start: 5000, end: 5999 }); // 恰好 1000 个
});

test('collectPortProcessesInRange: 收集范围内进程并按端口分行', () => {
  const output = [
    'TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    100',
    'TCP    0.0.0.0:8081    0.0.0.0:0    LISTENING    100',
    'TCP    0.0.0.0:9090    0.0.0.0:0    LISTENING    200',
    'UDP    0.0.0.0:8080    *:*          300',
    'TCP    0.0.0.0:8080    0.0.0.0:0    TIME_WAIT    0',
  ].join('\n');
  const { results, skipped } = core.collectPortProcessesInRange(output, 8080, 8085, {
    '100': 'node.exe',
    '300': 'svchost.exe',
  });
  // 同一 PID 100 占用 8080 与 8081 两个端口 → 两行；UDP 8080 一行
  assert.equal(results.length, 3);
  assert.equal(skipped, 1);
  const ports = results.map((r) => r.port).sort();
  assert.deepEqual(ports, ['8080', '8080', '8081']);
  assert.equal(results.find((r) => r.port === '8081').name, 'node.exe');
});

test('collectPortProcessesInRange: 无匹配', () => {
  const { results, skipped } = core.collectPortProcessesInRange('', 9000, 9100, {});
  assert.deepEqual(results, []);
  assert.equal(skipped, 0);
});

test('collectPortProcesses 结果包含 port 字段', () => {
  const output = 'TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    100';
  const { results } = core.collectPortProcesses(output, 8080, { '100': 'node.exe' });
  assert.equal(results.length, 1);
  assert.equal(results[0].port, '8080');
});

test('buildKillArgs', () => {
  assert.deepEqual(core.buildKillArgs(9999), ['taskkill', '/PID', '9999', '/F']);
});


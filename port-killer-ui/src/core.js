'use strict';

/**
 * 端口占用关闭工具 - 核心纯函数（与 Electron 解耦，便于单元测试）
 */

const MAX_PORT = 65535;

/** 校验端口号：合法返回 1~65535 整数，否则返回 null */
function validatePort(text) {
  if (typeof text === 'number') {
    return Number.isInteger(text) && text >= 1 && text <= MAX_PORT ? text : null;
  }
  const s = String(text == null ? '' : text).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_PORT ? n : null;
}

/** 从本地地址提取端口号：0.0.0.0:135 -> "135"，[::]:8080 -> "8080" */
function extractPort(addr) {
  if (!addr || typeof addr !== 'string') return null;
  const idx = addr.lastIndexOf(':');
  if (idx === -1) return null;
  const port = addr.slice(idx + 1);
  return port || null;
}

/** 解析一行 netstat -ano 输出，返回对象或 null */
function parseNetstatLine(line) {
  const parts = String(line).trim().split(/\s+/);
  if (parts.length < 3) return null;
  const proto = parts[0].toUpperCase();
  if (proto !== 'TCP' && proto !== 'UDP') return null;

  const info = {
    proto,
    localAddr: parts[1],
    localPort: extractPort(parts[1]),
    remoteAddr: parts[2] || '',
    state: '',
    pid: '',
  };

  if (proto === 'TCP') {
    // TCP: Proto Local Foreign State PID
    if (parts.length >= 5) {
      info.state = parts[3];
      info.pid = parts[4];
    } else if (parts.length === 4) {
      info.pid = parts[3];
    }
  } else if (parts.length >= 4) {
    // UDP: Proto Local Foreign PID
    info.pid = parts[3];
  }
  return info;
}

/** 简单解析一行 CSV（兼容引号内逗号） */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (const ch of String(line)) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else current += ch;
  }
  fields.push(current);
  return fields;
}

/** 解析 tasklist /FO CSV /NH 输出，得到 { pid: 进程名 } */
function parseTasklistNames(output) {
  const names = {};
  for (const line of String(output).split(/\r?\n/)) {
    const fields = parseCsvLine(line);
    if (fields.length < 2) continue;
    const name = fields[0].trim().replace(/^"|"$/g, '');
    const pid = fields[1].trim().replace(/^"|"$/g, '');
    if (/^\d+$/.test(pid)) names[pid] = name;
  }
  return names;
}

/**
 * 从 netstat 输出中收集占用指定端口的进程。
 * 返回 { results, skipped }：results 为可关闭进程列表（按 PID+协议+状态去重），
 * skipped 为被忽略的 PID=0 残留连接行数。
 */
function collectPortProcesses(netstatOutput, port, processNames) {
  const portStr = String(port);
  const results = [];
  const seen = new Set();
  let skipped = 0;

  for (const line of String(netstatOutput).split(/\r?\n/)) {
    const info = parseNetstatLine(line);
    if (!info || info.localPort !== portStr) continue;

    const key = `${info.pid}|${info.proto}|${info.state}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (info.pid === '' || info.pid === '0') {
      skipped += 1;
      continue;
    }

    results.push({
      pid: info.pid,
      name: (processNames && processNames[info.pid]) || '未知',
      proto: info.proto,
      localAddr: info.localAddr,
      state: info.state || '—',
    });
  }
  return { results, skipped };
}

/** 构造 taskkill 命令参数 */
function buildKillArgs(pid) {
  return ['taskkill', '/PID', String(pid), '/F'];
}

module.exports = {
  MAX_PORT,
  validatePort,
  extractPort,
  parseNetstatLine,
  parseCsvLine,
  parseTasklistNames,
  collectPortProcesses,
  buildKillArgs,
};

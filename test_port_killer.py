# -*- coding: utf-8 -*-
"""端口占用关闭工具 - 核心逻辑单元测试。"""

import unittest
from unittest import mock

import port_killer as pk


class TestValidatePort(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(pk.validate_port("80"), 80)
        self.assertEqual(pk.validate_port(" 8080 "), 8080)
        self.assertEqual(pk.validate_port("1"), 1)
        self.assertEqual(pk.validate_port("65535"), 65535)

    def test_invalid(self):
        self.assertIsNone(pk.validate_port("0"))
        self.assertIsNone(pk.validate_port("65536"))
        self.assertIsNone(pk.validate_port("abc"))
        self.assertIsNone(pk.validate_port(""))
        self.assertIsNone(pk.validate_port("12.5"))
        self.assertIsNone(pk.validate_port(None))


class TestExtractPort(unittest.TestCase):
    def test_ipv4(self):
        self.assertEqual(pk.extract_port("0.0.0.0:135"), "135")
        self.assertEqual(pk.extract_port("127.0.0.1:8080"), "8080")

    def test_ipv6(self):
        self.assertEqual(pk.extract_port("[::]:135"), "135")
        self.assertEqual(pk.extract_port("[::1]:8080"), "8080")

    def test_star(self):
        self.assertEqual(pk.extract_port("*:135"), "135")

    def test_invalid(self):
        self.assertIsNone(pk.extract_port("0.0.0.0"))
        self.assertIsNone(pk.extract_port(""))


class TestParseNetstatLine(unittest.TestCase):
    def test_tcp_listening(self):
        info = pk.parse_netstat_line("TCP    0.0.0.0:135    0.0.0.0:0    LISTENING    1234")
        self.assertIsNotNone(info)
        self.assertEqual(info["proto"], "TCP")
        self.assertEqual(info["local_port"], "135")
        self.assertEqual(info["state"], "LISTENING")
        self.assertEqual(info["pid"], "1234")

    def test_tcp_ipv6(self):
        info = pk.parse_netstat_line("TCP    [::]:8080    [::]:0    LISTENING    456")
        self.assertEqual(info["local_port"], "8080")
        self.assertEqual(info["pid"], "456")

    def test_udp(self):
        info = pk.parse_netstat_line("UDP    0.0.0.0:123    *:*    789")
        self.assertEqual(info["proto"], "UDP")
        self.assertEqual(info["local_port"], "123")
        self.assertEqual(info["pid"], "789")
        self.assertEqual(info["state"], "")

    def test_garbage(self):
        self.assertIsNone(pk.parse_netstat_line(""))
        self.assertIsNone(pk.parse_netstat_line("   "))
        self.assertIsNone(pk.parse_netstat_line("hello world"))
        self.assertIsNone(pk.parse_netstat_line("TCP    0.0.0.0"))


class TestFindProcessesOnPort(unittest.TestCase):
    def test_filters_by_port_and_skips_pid0(self):
        output = "\n".join([
            "TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    100",
            "TCP    127.0.0.1:8080  127.0.0.1:0  LISTENING    100",
            "TCP    0.0.0.0:9090    0.0.0.0:0    LISTENING    200",
            "UDP    0.0.0.0:8080    *:*          300",
            "TCP    0.0.0.0:8080    0.0.0.0:0    TIME_WAIT    0",
        ])
        with mock.patch.object(pk, "netstat_output", return_value=output):
            results, skipped = pk.find_processes_on_port(8080)
        pids = sorted(int(r["pid"]) for r in results)
        self.assertEqual(pids, [100, 300])
        self.assertEqual(skipped, 1)
        self.assertTrue(all(r["proto"] in ("TCP", "UDP") for r in results))

    def test_no_match(self):
        with mock.patch.object(pk, "netstat_output", return_value=""):
            results, skipped = pk.find_processes_on_port(9999)
        self.assertEqual(results, [])
        self.assertEqual(skipped, 0)


class TestParseCsvLine(unittest.TestCase):
    def test_tasklist_csv(self):
        fields = pk.parse_csv_line('"chrome.exe","1234","Console","1","N/A","50,000 K"')
        self.assertEqual(fields[0], "chrome.exe")
        self.assertEqual(fields[1], "1234")

    def test_comma_in_quotes(self):
        fields = pk.parse_csv_line('"a,b","c"')
        self.assertEqual(fields, ["a,b", "c"])


class TestGetProcessNames(unittest.TestCase):
    def test_builds_map(self):
        output = ('"chrome.exe","1234","Console","1","N/A","50,000 K"\n'
                  '"System","4","Services","0","N/A","100 K"\n')
        with mock.patch.object(pk, "_run", return_value=(0, output, "")):
            names = pk.get_process_names()
        self.assertEqual(names["1234"], "chrome.exe")
        self.assertEqual(names["4"], "System")


class TestKillProcess(unittest.TestCase):
    def test_success(self):
        with mock.patch.object(pk, "_run", return_value=(0, "成功: 已终止 PID 1234 的进程。", "")):
            ok, msg = pk.kill_process(1234)
        self.assertTrue(ok)

    def test_access_denied(self):
        with mock.patch.object(pk, "_run", return_value=(5, "", "拒绝访问")):
            ok, msg = pk.kill_process(1234)
        self.assertFalse(ok)
        self.assertIn("权限不足", msg)

    def test_not_found(self):
        with mock.patch.object(pk, "_run", return_value=(128, "", "没有找到进程")):
            ok, msg = pk.kill_process(1234)
        self.assertFalse(ok)
        self.assertIn("已不存在", msg)

    def test_calls_taskkill(self):
        with mock.patch.object(pk, "_run", return_value=(0, "", "")) as run:
            pk.kill_process(9999)
        run.assert_called_once_with(["taskkill", "/PID", "9999", "/F"])


if __name__ == "__main__":
    unittest.main()
